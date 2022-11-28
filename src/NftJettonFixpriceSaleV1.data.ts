import { Address, Cell, contractAddress, serializeDict, StateInit } from 'ton'
import BN from 'bn.js'
import { NftJettonFixpriceSaleV1CodeCell } from './NftJettonFixpriceSaleV1.source'

export type NftJettonFixpriceSaleV1Data = {
  isComplete: boolean
  createdAt: number
  marketplaceAddress: Address
  nftAddress: Address
  nftOwnerAddress: Address | null
  fullPrice: BN
  marketplaceFeeAddress: Address
  marketplaceFee: BN
  royaltyAddress: Address
  royaltyAmount: BN
  jettonsConfigured?: boolean,
  jettonPrices: Map<Address, { fullPrice: BN, marketplaceFee: BN, royaltyAmount: BN }> | null
}

export function buildJettonPricesDict(jettons: Map<Address, { fullPrice: BN, marketplaceFee: BN, royaltyAmount: BN }>) {
  // Transform jetton address to only hash
  const transformedJettons = new Map([...jettons.entries()].map(([address, amount]) => [new BN(address.hash).toString(10), amount]));
  const jettonsDict = serializeDict(transformedJettons, 256, (prices, cell) => {
    cell.bits.writeCoins(prices.fullPrice);
    cell.bits.writeCoins(prices.marketplaceFee);
    cell.bits.writeCoins(prices.royaltyAmount);
  });
  return jettonsDict;
}

export function buildNftJettonFixpriceSaleV1DataCell(data: NftJettonFixpriceSaleV1Data) {
  const feesCell = new Cell()

  feesCell.bits.writeAddress(data.marketplaceFeeAddress)
  feesCell.bits.writeCoins(data.marketplaceFee)
  feesCell.bits.writeAddress(data.royaltyAddress)
  feesCell.bits.writeCoins(data.royaltyAmount)

  const dataCell = new Cell()

  dataCell.bits.writeBit(data.isComplete)
  dataCell.bits.writeUint(data.createdAt, 32)
  dataCell.bits.writeAddress(data.marketplaceAddress)
  dataCell.bits.writeAddress(data.nftAddress)
  dataCell.bits.writeAddress(data.nftOwnerAddress)
  dataCell.bits.writeCoins(data.fullPrice)
  dataCell.refs.push(feesCell)

  dataCell.bits.writeBit(data.jettonsConfigured || false) // jettons configured
  if (data.jettonPrices && data.jettonPrices.size > 0) {
    dataCell.bits.writeBit(true)
    dataCell.refs.push(buildJettonPricesDict(data.jettonPrices))
  } else {
    dataCell.bits.writeBit(false)
  }


  return dataCell
}

export function buildNftJettonFixpriceSaleV1StateInit(
  data: Omit<NftJettonFixpriceSaleV1Data, 'nftOwnerAddress' | 'isComplete'>
) {
  const dataCell = buildNftJettonFixpriceSaleV1DataCell({
    ...data,
    // Nft owner address would be set by NFT itself by ownership_assigned callback
    nftOwnerAddress: null,
    isComplete: false,
    jettonsConfigured: false,
    jettonPrices: null,
  })

  const stateInit = new StateInit({
    code: NftJettonFixpriceSaleV1CodeCell,
    data: dataCell,
  })
  const address = contractAddress({
    workchain: 0,
    initialCode: NftJettonFixpriceSaleV1CodeCell,
    initialData: dataCell,
  })

  return {
    address,
    stateInit,
  }
}

export const OperationCodes = {
  AcceptCoins: 1,
  Buy: 2,
  CancelSale: 3,
  Deploy: 0x0822d8ae,
}

export const Queries = {
  cancelSale: (params: { queryId?: number }) => {
    const msgBody = new Cell()
    msgBody.bits.writeUint(OperationCodes.CancelSale, 32)
    msgBody.bits.writeUint(params.queryId ?? 0, 64)
    return msgBody
  },
}
