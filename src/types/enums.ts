import { registerEnumType } from 'type-graphql'

export enum AssetStatus {
  NONE = 'NONE',
  LISTED = 'LISTED',
  DELISTED = 'DELISTED',
}

registerEnumType(AssetStatus, { name: 'AssetStatus' })

export enum Network {
  TERRA = 'TERRA',
  ETH = 'ETH',
  BSC = 'BSC',
  COMBINE = 'COMBINE',
}

registerEnumType(Network, { name: 'Network' })
