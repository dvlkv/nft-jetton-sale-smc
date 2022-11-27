import { writeFile } from 'fs/promises';
import path from 'path';
import { Cell } from 'ton';
import { NftJettonFixPriceSaleSourceV1 } from '../src/NftJettonFixpriceSaleV1.source';
import { compileFunc } from '../src/utils/compileFunc';

const buildSourceContent = (result: Cell) => `
import { Cell } from 'ton'
import { combineFunc } from "./utils/combineFunc";

export const NftJettonFixPriceSaleSourceV1 = () => {
    return combineFunc(__dirname, [
      './contract/stdlib.fc',
      './contract/op-codes.fc',
      './contract/nft-jetton-fixprice-sale-v1.fc',
    ])
  }

const NftJettonFixpriceSaleV1CodeBoc =
  '${result.toBoc().toString('base64')}'

export const NftJettonFixpriceSaleV1CodeCell = Cell.fromBoc(Buffer.from(NftJettonFixpriceSaleV1CodeBoc, 'base64'))[0]
`

async function main() {
    let result = await compileFunc(NftJettonFixPriceSaleSourceV1());

    await writeFile(path.resolve(__dirname, '../src/NftJettonFixpriceSaleV1.source.ts'), buildSourceContent(result.cell));
}

main();