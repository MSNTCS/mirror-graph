import { findAttributes, findAttribute } from 'lib/terra'
import { assetService, statisticService } from 'services'
import { TxEntity, AssetPositionsEntity, DailyStatisticEntity } from 'orm'
import { TxType } from 'types'
import { ParseArgs } from './parseArgs'
import { splitTokenAmount } from 'lib/utils'

export async function parse(
  { manager, height, txHash, timestamp, sender, msg, log, contract }: ParseArgs
): Promise<void> {
  const { token, govId } = contract
  const datetime = new Date(timestamp)
  const attributes = findAttributes(log.events, 'from_contract')
  let parsed = {}

  if (msg['swap']) {
    const offerAsset = findAttribute(attributes, 'offer_asset')
    const askAsset = findAttribute(attributes, 'ask_asset')
    const offerAmount = findAttribute(attributes, 'offer_amount')
    const returnAmount = findAttribute(attributes, 'return_amount')
    const type = offerAsset === 'uusd' ? TxType.BUY : TxType.SELL

    parsed = {
      type,
      outValue: type === TxType.BUY ? offerAmount : '0',
      inValue: type === TxType.SELL ? returnAmount : '0',
      data: {
        offerAsset,
        askAsset,
        offerAmount,
        returnAmount,
        taxAmount: findAttribute(attributes, 'tax_amount'),
        spreadAmount: findAttribute(attributes, 'spread_amount'),
        commissionAmount: findAttribute(attributes, 'commission_amount'),
      }
    }

    // add daily trading volume
    const volume = type === TxType.BUY ? offerAmount : returnAmount
    const dailyStatRepo = manager.getRepository(DailyStatisticEntity)
    await statisticService().addDailyTradingVolume(datetime.getTime(), volume, dailyStatRepo)
  } else if (msg['provide_liquidity']) {
    const assets = findAttribute(attributes, 'assets')
    parsed = {
      type: TxType.PROVIDE_LIQUIDITY,
      data: { assets, share: findAttribute(attributes, 'share') }
    }

    // add liquidity position
    const positionsRepo = manager.getRepository(AssetPositionsEntity)
    const liquidities = assets.split(', ')
    for (const liquidityAmount of liquidities) {
      const liquidity = splitTokenAmount(liquidityAmount)
      await assetService().addLiquidityPosition(liquidity.token, liquidity.amount, positionsRepo)
    }
  } else if (msg['withdraw_liquidity']) {
    const refundAssets = findAttribute(attributes, 'refund_assets')
    parsed = {
      type: TxType.WITHDRAW_LIQUIDITY,
      data: { refundAssets, withdrawnShare: findAttribute(attributes, 'withdrawn_share') }
    }

    // remove liquidity position
    const positionsRepo = manager.getRepository(AssetPositionsEntity)
    const liquidities = refundAssets.split(', ')
    for (const liquidityAmount of liquidities) {
      const liquidity = splitTokenAmount(liquidityAmount)
      await assetService().addLiquidityPosition(liquidity.token, `-${liquidity.amount}`, positionsRepo)
    }
  } else {
    return
  }

  const tx = new TxEntity({
    ...parsed, height, txHash, account: sender, datetime, govId, token, contract
  })

  await manager.save(tx)
}
