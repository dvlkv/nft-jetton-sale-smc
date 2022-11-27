import { SmartContract } from 'ton-contract-executor'
import { Address, Cell, contractAddress, Slice } from 'ton'
import BN from 'bn.js'
import { buildNftJettonFixpriceSaleV1DataCell, NftJettonFixpriceSaleV1Data, Queries } from './NftJettonFixpriceSaleV1.data'
import { NftJettonFixPriceSaleSourceV1 } from './NftJettonFixpriceSaleV1.source'
import { compileFunc } from "./utils/compileFunc";

export class NftJettonFixpriceSaleV1Local {
  private constructor(public readonly contract: SmartContract, public readonly address: Address) {}

  static queries = Queries

  async getSaleData() {
    const res = await this.contract.invokeGetMethod('get_sale_data', [])

    if (res.exit_code !== 0) {
      throw new Error('Unable to invoke get_sale_data on sale contract')
    }

    const [
      saleType,
      isComplete,
      createdAt,
      marketplaceAddressSlice,
      nftAddressSlice,
      nftOwnerAddressSlice,
      fullPrice,
      jettonsDict,
      marketplaceFeeAddressSlice,
      marketplaceFee,
      royaltyAddressSlice,
      royaltyAmount,
    ] = res.result as [BN, BN, BN, Slice, Slice, Slice, BN, Cell, Slice, BN, Slice, BN]

    if (saleType.toNumber() !== 0x46495850) {
      throw new Error(`Unknown sale type: ${saleType.toString()}`)
    }

    return {
      isComplete: isComplete.eqn(-1),
      createdAt: createdAt.toNumber(),
      marketplaceAddress: marketplaceAddressSlice.readAddress()!,
      nftAddress: nftAddressSlice.readAddress()!,
      nftOwnerAddress: nftOwnerAddressSlice.readAddress(),
      fullPrice,
      jettonsDict,
      marketplaceFeeAddress: marketplaceFeeAddressSlice.readAddress()!,
      marketplaceFee,
      royaltyAddress: royaltyAddressSlice.readAddress()!,
      royaltyAmount,
    }
  }

  static async createFromConfig(config: NftJettonFixpriceSaleV1Data) {
    const code = await compileFunc(NftJettonFixPriceSaleSourceV1());

    const data = buildNftJettonFixpriceSaleV1DataCell(config)
    const contract = await SmartContract.fromCell(code.cell, data)

    const address = contractAddress({
      workchain: 0,
      initialData: contract.dataCell,
      initialCode: contract.codeCell,
    })

    contract.setC7Config({
      myself: address,
    })

    return new NftJettonFixpriceSaleV1Local(contract, address)
  }

  static async create(config: { code: Cell; data: Cell; address: Address }) {
    const contract = await SmartContract.fromCell(config.code, config.data)
    contract.setC7Config({
      myself: config.address,
    })
    return new NftJettonFixpriceSaleV1Local(contract, config.address)
  }

  static async createFromContract(contract: SmartContract, address: Address) {
    contract.setC7Config({
      myself: address,
    })
    return new NftJettonFixpriceSaleV1Local(contract, address)
  }
}
