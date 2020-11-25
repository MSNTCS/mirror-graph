import * as bluebird from 'bluebird'
import { LCDClient } from '@terra-money/terra.js'
import { Snapshot, Airdrop } from '@mirror-protocol/mirror-airdrop'
import { getManager, EntityManager } from 'typeorm'
import { TxWallet } from 'lib/terra'
import * as logger from 'lib/logger'
import { Updater } from 'lib/Updater'
import { num } from 'lib/num'
import { contractQuery } from 'lib/terra'
import { contractService, govService } from 'services'
import { AirdropEntity } from 'orm'
import { ContractType } from 'types'

const lcdUrl = 'https://lcd.terra.dev'

// 2020.11.23 00:00(UTC+0) height: 677984, (snapshot height must be in 10,000 units)
const INITIAL_AIRDROP_BLOCK_HEIGHT = 680000
const INITIAL_AIRDROP_AMOUNT = '9150000000000'

// floor(18300000000000(airdrop total) / 53) = 345283000000
const LUNA_STAKER_AIRDROP_AMOUNT = '345283000000'

// const SNAPSHOT_BLOCK_START =  900000
// const SNAPSHOT_BLOCK_PERIOD = 100000
const SNAPSHOT_BLOCK_START = 690000
const SNAPSHOT_BLOCK_PERIOD = 10000

const SNAPSHOT_LAST_STAGE = 53 + 1 // start stage: 2, initial stage: 1

const updater = new Updater(60 * 60000) // 1hour

async function takeSnapshot(
  wallet: TxWallet, airdropContract: string, stage: number, height: number, airdropAmount: string, isInitialAirdrop = false
): Promise<void> {
  // take snapshot
  const snapshot = new Snapshot(lcdUrl)
  const snapshotHeight = height - (height % 10000)
  const delegators = await snapshot.takeSnapshot(snapshotHeight)

  // filtering - staked luna >= 1000
  const delegatorAddresses = Object.keys(delegators)
    .filter((delegator) => num(delegators[delegator].toString()).isGreaterThanOrEqualTo(1000000000))
  if (delegatorAddresses.length < 1) {
    throw new Error('take snapshot failed. target delegators is none.')
  }

  // calculate total staked luna amount
  const total = delegatorAddresses.reduce((s, x) => s.plus(delegators[x].toString()), num(0))
  if (!total.isFinite()) {
    throw new Error('calculate total failed')
  }

  // calculate airdrop amount per account
  const accounts = []
  delegatorAddresses.map((delegator) => {
    const staked = num(delegators[delegator].toString())
    const rate = staked.dividedBy(total).toString()

    const amount = isInitialAirdrop
      ? num(airdropAmount).dividedBy(delegatorAddresses.length).toFixed(0)
      : num(airdropAmount).multipliedBy(rate).toFixed(0)

    accounts.push({ address: delegator, amount, staked: staked.toString(), rate })
  })

  const airdrop = new Airdrop(accounts)
  await getManager().transaction(async (manager: EntityManager) => {
    const repo = manager.getRepository(AirdropEntity)
    const merkleRoot = airdrop.getMerkleRoot()

    // save airdrop information to db
    await bluebird.map(accounts, async (account) => {
      const { address, staked, rate, amount } = account
      const proof = airdrop.getMerkleProof({ address, amount })

      if (await repo.findOne({ stage, address })) {
        logger.info(`already airdrop listed account. ${address}, stage: ${stage}`)
        return
      }

      await repo.save({
        network: 'TERRA',
        stage,
        address,
        staked,
        rate,
        amount,
        total: total.toString(),
        proof: JSON.stringify(proof),
        merkleRoot
      })
    })

    // register merkle root
    await wallet.execute(airdropContract, { registerMerkleRoot: { merkleRoot } })
  })

  logger.info(
    `take airdrop snapshot - stage: ${stage}, height: ${snapshotHeight}, stakers: ${accounts.length}, staked: ${total.dividedBy(1000000).toFormat(0)}, airdrop: ${num(airdropAmount).dividedBy(1000000).toFormat(0)}`
  )
  // console.log("Merkle Root", airdrop.getMerkleRoot());
  // console.log("Merkle Proof", proof);
  // console.log("Target Acc", accounts[0]);
  // console.log("Verified", airdrop.verify(proof, accounts[0]));
}

export async function updateAirdrop(wallet: TxWallet): Promise<void> {
  if (!updater.needUpdate(Date.now())) {
    return
  }

  const lcd = new LCDClient({ URL: lcdUrl, chainID: 'columbus-4', gasPrices: { uusd: 0.15 } })
  const latestBlock = await lcd.tendermint.blockInfo()
  if (!latestBlock)
    return

  const contract = await contractService().get({ type: ContractType.AIRDROP, gov: govService().get() })
  if (!contract) {
    throw new Error('airdrop contract not exists')
  }

  // const record = await getRepository(AirdropEntity).findOne(undefined, { order: { id: 'DESC' }})
  // const latestStage = record ? record.stage : undefined

  const { latestStage } = await contractQuery(contract.address, { latestStage: {} })
  if (!latestStage) {
    // take initial airdrop snapshot
    await takeSnapshot(wallet, contract.address, 1, INITIAL_AIRDROP_BLOCK_HEIGHT, INITIAL_AIRDROP_AMOUNT, true)

    logger.info('initial airdrop snapshot updated')
    return
  }

  const latestBlockHeight = +latestBlock.block.header.height
  const nextStage = latestStage + 1
  const nextStageHeight = SNAPSHOT_BLOCK_START + ((nextStage - 2) * SNAPSHOT_BLOCK_PERIOD)

  if (nextStage <= SNAPSHOT_LAST_STAGE && latestBlockHeight - 10 >= nextStageHeight) {
    await takeSnapshot(wallet, contract.address, nextStage, nextStageHeight, LUNA_STAKER_AIRDROP_AMOUNT, true)
  }

  logger.info('snapshot updated')
}