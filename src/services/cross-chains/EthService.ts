import memoize from 'memoizee-decorator'
import { Container, Service, Inject } from 'typedi'
import { find } from 'lodash'
import { loadEthAssets } from 'lib/data'
import { queryAssetInfos } from 'lib/eth'
import { AssetService } from 'services'
import { EthAsset, EthAssetInfos, EthAssets } from 'types'

@Service()
export class EthService {
  constructor(
    @Inject((type) => AssetService) private readonly assetService: AssetService,
  ) {}

  @memoize({})
  getAssets(): EthAssets {
    return loadEthAssets()
  }

  @memoize({})
  async getAsset(token: string): Promise<EthAsset> {
    const asset = await this.assetService.get({ token })

    return find(this.getAssets(), (ethAsset) => ethAsset.symbol === asset.symbol)
  }

  @memoize({ promise: true, maxAge: 60000 * 10 }) // 10 minutes
  async getEthInfos(): Promise<EthAssetInfos> {
    return queryAssetInfos()
  }
}

export function ethService(): EthService {
  return Container.get(EthService)
}
