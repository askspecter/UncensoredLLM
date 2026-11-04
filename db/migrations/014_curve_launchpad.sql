-- Coins from BeeperCurveLauncher (Beeper's own curve with anti sniper protection) share launch_coins with the Pons
-- launcher's coins. Their ids are stored offset by 1,000,000 so both id spaces fit the primary key.
ALTER TABLE launch_coins ADD COLUMN kind text NOT NULL DEFAULT 'pons' CHECK (kind IN ('pons', 'curve'));
ALTER TABLE launch_coins ADD COLUMN protect_until timestamptz;
ALTER TABLE launch_coins ADD COLUMN sniper_bps integer NOT NULL DEFAULT 0;
ALTER TABLE launch_coins ADD COLUMN max_wallet_bps integer NOT NULL DEFAULT 10000;
