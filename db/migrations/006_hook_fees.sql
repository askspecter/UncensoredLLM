-- USDG fees collected by BeeperHook (the $BEEP / USDG Uniswap v4 pool) are added to each day's bCREDIT pool.
ALTER TABLE bcredit_epochs ADD COLUMN hook_fees_micros bigint NOT NULL DEFAULT 0;
ALTER TABLE bcredit_epochs ADD COLUMN hook_to_block bigint;  -- last block whose hook fees were counted
