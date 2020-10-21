import { Repository, FindConditions, FindOneOptions, getConnection } from 'typeorm'
import { InjectRepository } from 'typeorm-typedi-extensions'
import { Container, Service, Inject } from 'typedi'
import { lcd } from 'lib/terra'
import { num } from 'lib/num'
import { PriceService } from 'services'
import { AssetBalance, ValueAt } from 'graphql/schema'
import { BalanceEntity } from 'orm'

@Service()
export class AccountService {
  constructor(
    @Inject((type) => PriceService) private readonly priceService: PriceService,
    @InjectRepository(BalanceEntity) private readonly balanceRepo: Repository<BalanceEntity>,
  ) {}

  async getBalanceEntity(
    conditions: FindConditions<BalanceEntity>,
    options?: FindOneOptions<BalanceEntity>,
    repo = this.balanceRepo
  ): Promise<BalanceEntity> {
    return repo.findOne(conditions, options)
  }

  async getBalance(address: string, token: string): Promise<AssetBalance> {
    if (token === 'uusd') {
      const coin = (await lcd.bank.balance(address)).get(token)
      return { token, balance: coin.amount.toString(), averagePrice: '0' }
    }

    const balanceEntity = await this.getBalanceEntity(
      { address, token }, { select: ['balance', 'averagePrice'], order: { datetime: 'DESC' } }
    )
    if (!balanceEntity)
      return

    return {
      token,
      balance: balanceEntity.balance,
      averagePrice: balanceEntity.averagePrice,
    }
  }

  async getBalances(address: string, repo = this.balanceRepo): Promise<AssetBalance[]> {
    return repo
      .createQueryBuilder()
      .select('DISTINCT ON (token) token', 'token')
      .addSelect('balance')
      .addSelect('average_price', 'averagePrice')
      .where('address = :address', { address })
      .orderBy('token')
      .addOrderBy('datetime', 'DESC')
      .getRawMany()
  }

  async getBalanceHistory(address: string, from: number, to: number, interval: number): Promise<ValueAt[]> {
    return getConnection().query(
      'SELECT * FROM public.balanceHistory($1, $2, $3, $4)',
      [address, new Date(from), new Date(to), interval]
    )
  }

  async addBalance(
    address: string, token: string, price: string, amount: string, datetime: Date, repo = this.balanceRepo
  ): Promise<BalanceEntity> {
    const latest = await this.getBalanceEntity(
      { address, token }, { order: { datetime: 'DESC' } }, repo
    )
    let entity

    if (latest) {
      entity = new BalanceEntity({
        address, token, averagePrice: latest.averagePrice, balance: latest.balance, datetime
      })

      const totalBalance = num(entity.balance).plus(amount)

      if (num(price).isGreaterThan(0)) {
        // average = (last.avg_price*last.amount + current.avg_price*current.amount) / total_amount
        const value = num(price).multipliedBy(amount)
        const lastValue = num(entity.averagePrice).multipliedBy(entity.balance)

        entity.averagePrice = lastValue.plus(value).dividedBy(totalBalance).toString()
      }

      entity.balance = totalBalance.toString()
    } else {
      entity = new BalanceEntity({
        address, token, averagePrice: price, balance: amount, datetime
      })
    }

    return repo.save(entity)
  }

  async removeBalance(
    address: string, token: string, amount: string, datetime: Date, repo = this.balanceRepo
  ): Promise<BalanceEntity> {
    const latest = await this.getBalanceEntity(
      { address, token }, { order: { datetime: 'DESC' } }, repo
    )
    if (!latest) {
      return
    }

    const entity = new BalanceEntity({
      address,
      token,
      averagePrice: latest.averagePrice,
      balance: num(latest.balance).minus(amount).toString(),
      datetime,
    })

    return repo.save(entity)
  }
}

export function accountService(): AccountService {
  return Container.get(AccountService)
}
