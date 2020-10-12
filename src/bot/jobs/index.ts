import * as nodeCron from 'node-cron'
import { TxWallet } from 'lib/terra'
import { getKey } from 'lib/keystore'
import config from 'config'
import { distributeRewards } from './rewards'

export function createJobs(botPassword: string): void {
  const wallet = new TxWallet(getKey(config.KEYSTORE_PATH, config.BOT_KEY, botPassword))

  // min hour dayofmonth month dayofweek

  // every 1hour
  nodeCron.schedule('0 * * * *', () => distributeRewards(wallet))
}