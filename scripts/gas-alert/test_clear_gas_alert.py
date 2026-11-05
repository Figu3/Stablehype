import unittest

from clear_gas_alert import STALE_KEY, evaluate

NOW = 1_800_000_000


def wallet(hours, balance=0.1, label="Oracle keeper", address="0xabc"):
    return {"address": address, "label": label, "balanceEth": balance, "runwayHours": hours}


def run(hours, seen=None, updated=NOW):
    return evaluate({"wallets": [wallet(hours)], "updatedAt": updated}, seen or {}, NOW)


class Thresholds(unittest.TestCase):
    def test_quiet_above_72h(self):
        self.assertEqual(run(100), ([], {}))

    def test_alerts_at_each_threshold(self):
        for hours, level in ((71, 72), (47, 48), (23, 24)):
            messages, seen = run(hours)
            self.assertEqual(len(messages), 1)
            self.assertEqual(seen, {"0xabc": level})
            self.assertIn(f"{level}h", messages[0])

    def test_alerts_once_per_threshold(self):
        self.assertEqual(run(70, {"0xabc": 72}), ([], {"0xabc": 72}))

    def test_alerts_again_on_the_next_threshold(self):
        messages, seen = run(47, {"0xabc": 72})
        self.assertEqual(len(messages), 1)
        self.assertEqual(seen, {"0xabc": 48})

    def test_jumping_two_thresholds_sends_one_message(self):
        messages, seen = run(20, {"0xabc": 72})
        self.assertEqual(len(messages), 1)
        self.assertEqual(seen, {"0xabc": 24})

    def test_a_refill_rearms_every_threshold(self):
        self.assertEqual(run(200, {"0xabc": 24}), ([], {}))

    def test_a_partial_refill_rearms_the_lower_thresholds(self):
        messages, seen = run(60, {"0xabc": 24})
        self.assertEqual(messages, [])
        self.assertEqual(seen, {"0xabc": 72})
        self.assertEqual(len(run(40, seen)[0]), 1)

    def test_no_burn_rate_keeps_the_current_level(self):
        self.assertEqual(run(None, {"0xabc": 48}), ([], {"0xabc": 48}))


class BlindData(unittest.TestCase):
    def test_stale_data_warns_once_and_judges_no_wallet(self):
        messages, seen = run(10, updated=NOW - 7200)
        self.assertEqual(len(messages), 1)
        self.assertIn("aveugle", messages[0])
        self.assertTrue(seen[STALE_KEY])
        self.assertNotIn("0xabc", seen)
        self.assertEqual(run(10, seen, updated=NOW - 7200)[0], [])

    def test_missing_balance_counts_as_blind(self):
        data = {"wallets": [wallet(10, balance=None)], "updatedAt": NOW}
        self.assertTrue(evaluate(data, {}, NOW)[1][STALE_KEY])

    def test_fresh_data_clears_the_warning(self):
        self.assertEqual(run(100, {STALE_KEY: True}), ([], {}))

    def test_stale_data_keeps_the_wallet_levels(self):
        self.assertEqual(run(10, {"0xabc": 24, STALE_KEY: True}, updated=NOW - 7200)[1]["0xabc"], 24)


if __name__ == "__main__":
    unittest.main()
