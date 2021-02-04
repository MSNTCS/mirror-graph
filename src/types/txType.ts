import { registerEnumType } from 'type-graphql'
import { Transfer } from 'lib/terra'

export enum TxType {
  BUY = 'BUY',
  SELL = 'SELL',
  SEND = 'SEND',
  RECEIVE = 'RECEIVE',

  OPEN_POSITION = 'OPEN_POSITION',
  DEPOSIT_COLLATERAL = 'DEPOSIT_COLLATERAL',
  WITHDRAW_COLLATERAL = 'WITHDRAW_COLLATERAL',
  MINT = 'MINT',
  BURN = 'BURN',
  AUCTION = 'AUCTION',

  PROVIDE_LIQUIDITY = 'PROVIDE_LIQUIDITY',
  WITHDRAW_LIQUIDITY = 'WITHDRAW_LIQUIDITY',
  STAKE = 'STAKE',
  UNSTAKE = 'UNSTAKE',
  GOV_STAKE = 'GOV_STAKE',
  GOV_UNSTAKE = 'GOV_UNSTAKE',
  GOV_CREATE_POLL = 'GOV_CREATE_POLL',
  GOV_END_POLL = 'GOV_END_POLL',
  GOV_CAST_POLL = 'GOV_CAST_POLL',
  WITHDRAW_REWARDS = 'WITHDRAW_REWARDS',
  CLAIM_AIRDROP = 'CLAIM_AIRDROP',

  TERRA_SWAP = 'TERRA_SWAP',
  TERRA_SEND = 'TERRA_SEND',
  TERRA_SWAP_SEND = 'TERRA_SWAP_SEND',
  TERRA_RECEIVE = 'TERRA_RECEIVE',

  REGISTRATION = 'REGISTRATION',
}

registerEnumType(TxType, { name: 'TxType' })

export type TxData = Transfer | Record<string, string>
