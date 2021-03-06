import { Repository, FindConditions, FindOneOptions, FindManyOptions, EntityManager } from 'typeorm'
import { InjectRepository } from 'typeorm-typedi-extensions'
import { Container, Service, Inject } from 'typedi'
import { num } from 'lib/num'
import { AccountService } from 'services'
import { TxEntity } from 'orm'

@Service()
export class TxService {
  constructor(
    @Inject((type) => AccountService) private readonly accountService: AccountService,
    @InjectRepository(TxEntity) private readonly repo: Repository<TxEntity>
  ) {}

  async get(
    conditions: FindConditions<TxEntity>,
    options?: FindOneOptions<TxEntity>,
    repo = this.repo
  ): Promise<TxEntity> {
    return repo.findOne(conditions, options)
  }

  async getAll(options?: FindManyOptions<TxEntity>, repo = this.repo): Promise<TxEntity[]> {
    return repo.find(options)
  }

  async getHistory(
    account: string,
    tag: string | undefined,
    offset: number,
    limit: number,
    repo = this.repo
  ): Promise<TxEntity[]> {
    let qb = repo
      .createQueryBuilder()
      .where('address = :account', { account })
      .skip(offset)
      .take(limit)
      .orderBy('id', 'DESC')

    if (tag) {
      qb = qb.andWhere(':tag = ANY(tags)', { tag })
    }

    return qb.getMany()
  }

  async newTx(tx: Partial<TxEntity>, manager?: EntityManager): Promise<TxEntity> {
    if (!(await this.accountService.get({ address: tx.address }))) {
      await this.accountService.newAccount({ address: tx.address })
    }

    return manager ? manager.save(new TxEntity(tx)) : this.repo.save(tx)
  }

  async getTradingVolume(account: string, from: number, to: number): Promise<string> {
    const buyVolume = await this.repo
      .createQueryBuilder()
      .select(`sum(coalesce((data->>'offerAmount')::numeric, 0))`, 'volume')
      .where(`address = :address AND type='BUY'`, { address: account })
      .andWhere('datetime BETWEEN :from AND :to', { from: new Date(from), to: new Date(to) })
      .getRawOne()
    const sellVolume = await this.repo
      .createQueryBuilder()
      .select(
        `sum(coalesce((data->>'recvAmount')::numeric, 0))+sum(coalesce((data->>'commissionAmount')::numeric, 0))`,
        'volume'
      )
      .where(`address = :address AND type='SELL'`, { address: account })
      .andWhere('datetime BETWEEN :from AND :to', { from: new Date(from), to: new Date(to) })
      .getRawOne()

    return num(buyVolume?.volume ?? '0')
      .plus(sellVolume?.volume ?? '0')
      .toFixed(0)
  }
}

export function txService(): TxService {
  return Container.get(TxService)
}
