import { Address, beginCell, Builder, Cell, CellMessage, CommonMessageInfo, ExternalMessage, InternalMessage, serializeDict, toNano } from 'ton'
import { buildJettonPricesDict, NftJettonFixpriceSaleV1Data, OperationCodes } from './NftJettonFixpriceSaleV1.data'
import { NftJettonFixpriceSaleV1Local } from './NftJettonFixpriceSaleV1Local'
import BN from 'bn.js'
import { randomAddress } from "./utils/randomAddress";


function assertNotNull(a: unknown): asserts a {
  expect(a).not.toBeNull();
}

function assert(a: unknown): asserts a {
  expect(a).toBeTruthy();
}

function assertAddress(a: unknown, b: Address) {
  expect(a).toBeInstanceOf(Address);
  if (a instanceof Address) {
    expect(a.equals(b)).toBeTruthy();
  }
}

function assertCoins(a: BN, b: BN) {
  expect(a.eq(b)).toBeTruthy();
}


const jettons = new Map<Address, { fullPrice: BN, marketplaceFee: BN, royaltyAmount: BN }>([
  [randomAddress(), { fullPrice: toNano(1), marketplaceFee: toNano(0.1), royaltyAmount: toNano(0.1) }],
  [randomAddress(), { fullPrice: toNano(1.2), marketplaceFee: toNano(0.12), royaltyAmount: toNano(0.12) }],
  [randomAddress(), { fullPrice: toNano(1.1), marketplaceFee: toNano(0.11), royaltyAmount: toNano(0.11) }],
]);

const defaultConfig: NftJettonFixpriceSaleV1Data = {
  isComplete: false,
  createdAt: 0,
  marketplaceAddress: randomAddress(),
  nftAddress: randomAddress(),
  nftOwnerAddress: randomAddress(),
  fullPrice: toNano(1),
  marketplaceFee: toNano('0.03'),
  marketplaceFeeAddress: randomAddress(),
  royaltyAmount: toNano('0.04'),
  royaltyAddress: randomAddress(),
  jettonsConfigured: true,
  jettonPrices: jettons,
}

describe('fix price jetton sell contract v1', () => {

  it('should return sale info', async () => {
    const sale = await NftJettonFixpriceSaleV1Local.createFromConfig(defaultConfig)
    const res = await sale.getSaleData()

    expect(res.isComplete).toEqual(defaultConfig.isComplete)
    expect(res.createdAt).toEqual(defaultConfig.createdAt)
    expect(res.marketplaceAddress.toFriendly()).toEqual(defaultConfig.marketplaceAddress.toFriendly())
    expect(res.nftAddress.toFriendly()).toEqual(defaultConfig.nftAddress.toFriendly())
    expect(res.nftOwnerAddress?.toFriendly()).toEqual(defaultConfig.nftOwnerAddress!.toFriendly())
    expect(res.marketplaceFeeAddress.toFriendly()).toEqual(defaultConfig.marketplaceFeeAddress.toFriendly())
    expect(res.royaltyAddress.toFriendly()).toEqual(defaultConfig.royaltyAddress.toFriendly())
    expect(res.fullPrice.eq(defaultConfig.fullPrice)).toBe(true)
    expect(res.marketplaceFee.eq(defaultConfig.marketplaceFee)).toBe(true)
    expect(res.royaltyAmount.eq(defaultConfig.royaltyAmount)).toBe(true)

    for (let key of jettons.keys()) {
      let a = jettons.get(key)
      let b = res.jettonPrices.get([...res.jettonPrices.keys()].find(k => k.toFriendly() === key.toFriendly())!) // Map is missbehaving with Address keys
      assertNotNull(a)
      assertNotNull(b)

      expect(a.fullPrice.eq(b.fullPrice)).toBe(true)
      expect(a.marketplaceFee.eq(b.marketplaceFee)).toBe(true)
      expect(a.royaltyAmount.eq(b.royaltyAmount)).toBe(true)
    }
  })

  it('should accept deploy only from marketplace', async () => {
    // Nft owner address is null after deploy
    const conf: NftJettonFixpriceSaleV1Data = {
      ...defaultConfig,
      nftOwnerAddress: null,
      jettonPrices: null,
      jettonsConfigured: false
    }
    const sale = await NftJettonFixpriceSaleV1Local.createFromConfig(conf)


    const deployPayload = beginCell()
                  .storeUint(OperationCodes.Deploy, 32)
                  .storeUint(0, 64)
                  .storeRefMaybe(buildJettonPricesDict(jettons))
                  .endCell()

    let res = await sale.contract.sendInternalMessage(
      new InternalMessage({
        to: sale.address,
        from: conf.marketplaceAddress,
        value: toNano(1),
        bounce: false,
        body: new CommonMessageInfo({
          body: new CellMessage(deployPayload),
        }),
      })
    )
    if (res.logs) {
      throw new Error(res.logs)
    }
    expect(res.exit_code).toEqual(0)

    // Should fail if it's not from marketplace
    res = await sale.contract.sendInternalMessage(
      new InternalMessage({
        to: sale.address,
        from: randomAddress(),
        value: toNano(1),
        bounce: false,
        body: new CommonMessageInfo({
          body: new CellMessage(new Cell()),
        }),
      })
    )
    if (res.logs) {
      throw new Error(res.logs)
    }
    expect(res.exit_code).not.toEqual(0)
  })

  it('should accept init message only from NFT', async () => {
    // Nft owner address is null after deploy
    const conf: NftJettonFixpriceSaleV1Data = {
      ...defaultConfig,
      nftOwnerAddress: null,
    }
    const prevOwner = randomAddress()
    let sale = await NftJettonFixpriceSaleV1Local.createFromConfig(conf)

    const nftOwnershipAssignedCell = new Cell()
    nftOwnershipAssignedCell.bits.writeUint(0x05138d91, 32) // ownership_assigned
    nftOwnershipAssignedCell.bits.writeUint(0, 64) // query_id
    nftOwnershipAssignedCell.bits.writeAddress(prevOwner) // prev_owner

    let res = await sale.contract.sendInternalMessage(
      new InternalMessage({
        to: sale.address,
        from: conf.nftAddress,
        value: toNano(1),
        bounce: false,
        body: new CommonMessageInfo({
          body: new CellMessage(nftOwnershipAssignedCell),
        }),
      })
    )
    if (res.logs) {
      throw new Error(res.logs)
    }
    expect(res.exit_code).toEqual(0)

    sale = await NftJettonFixpriceSaleV1Local.createFromConfig(conf)
    // Should fail if message is not from NFT
    res = await sale.contract.sendInternalMessage(
      new InternalMessage({
        to: sale.address,
        from: randomAddress(),
        value: toNano(1),
        bounce: false,
        body: new CommonMessageInfo({
          body: new CellMessage(nftOwnershipAssignedCell),
        }),
      })
    )
    if (res.logs) {
      throw new Error(res.logs)
    }
    expect(res.exit_code).not.toEqual(0)

    sale = await NftJettonFixpriceSaleV1Local.createFromConfig(conf)
    // Should fail if it's not ownership_assigned callback
    res = await sale.contract.sendInternalMessage(
      new InternalMessage({
        to: sale.address,
        from: conf.nftAddress,
        value: toNano(1),
        bounce: false,
        body: new CommonMessageInfo({
          body: new CellMessage(new Cell()),
        }),
      })
    )
    expect(res.type !== 'success').toBe(true)
  })

  it('should initialize after ownership_assigned callback', async () => {
    const conf: NftJettonFixpriceSaleV1Data = {
      ...defaultConfig,
      nftOwnerAddress: null,
    }
    const prevOwner = randomAddress()
    const sale = await NftJettonFixpriceSaleV1Local.createFromConfig(conf)

    const nftOwnershipAssignedCell = new Cell()
    nftOwnershipAssignedCell.bits.writeUint(0x05138d91, 32) // ownership_assigned
    nftOwnershipAssignedCell.bits.writeUint(0, 64) // query_id
    nftOwnershipAssignedCell.bits.writeAddress(prevOwner) // prev_owner

    const res = await sale.contract.sendInternalMessage(
      new InternalMessage({
        to: sale.address,
        from: conf.nftAddress,
        value: toNano(1),
        bounce: false,
        body: new CommonMessageInfo({
          body: new CellMessage(nftOwnershipAssignedCell),
        }),
      })
    )
    if (res.logs) {
      throw new Error(res.logs)
    }
    expect(res.exit_code).toEqual(0)

    const data = await sale.getSaleData()

    expect(data.nftOwnerAddress?.toFriendly()).toEqual(prevOwner.toFriendly())
  })

  it.each([
    [{
      ...defaultConfig,
      jettonsConfigured: false,
      jettonPrices: null,
    }],
    [{
      ...defaultConfig,
      jettonsConfigured: false,
      jettonPrices: null,
      nftOwnerAddress: null,
    }],
    [{
      ...defaultConfig,
      nftOwnerAddress: null,
    }]
  ])('should not buy if not initialized', async (config: NftJettonFixpriceSaleV1Data) => {
    const sale = await NftJettonFixpriceSaleV1Local.createFromConfig(config)
    const buyerAddress = randomAddress()
    const res = await sale.contract.sendInternalMessage(
      new InternalMessage({
        to: sale.address,
        from: buyerAddress,
        value: toNano(2),
        bounce: false,
        body: new CommonMessageInfo({
          body: new CellMessage(new Cell()),
        }),
      })
    )

    expect(res.exit_code).not.toEqual(0)
  })

  it('should accept coins for op=1', async () => {
    const sale = await NftJettonFixpriceSaleV1Local.createFromConfig(defaultConfig)

    const body = new Cell()
    body.bits.writeUint(1, 32) // op
    body.bits.writeUint(0, 64) // query_id

    const res = await sale.contract.sendInternalMessage(
      new InternalMessage({
        to: sale.address,
        from: randomAddress(),
        value: toNano(1),
        bounce: false,
        body: new CommonMessageInfo({
          body: new CellMessage(body),
        }),
      })
    )
    if (res.logs) {
      throw new Error(res.logs)
    }
    expect(res.exit_code).toEqual(0)
  })

  it('should cancel sale', async () => {
    const sale = await NftJettonFixpriceSaleV1Local.createFromConfig(defaultConfig)

    const body = new Cell()
    body.bits.writeUint(3, 32) // op
    body.bits.writeUint(0, 64) // query_id

    let res = await sale.contract.sendInternalMessage(
      new InternalMessage({
        to: sale.address,
        from: randomAddress(),
        value: toNano(1),
        bounce: false,
        body: new CommonMessageInfo({
          body: new CellMessage(body),
        }),
      })
    )
    if (res.logs) {
      throw new Error(res.logs)
    }
    // Should fail if sender is not current owner
    expect(res.exit_code).not.toEqual(0)

    res = await sale.contract.sendInternalMessage(
      new InternalMessage({
        to: sale.address,
        from: defaultConfig.nftOwnerAddress,
        value: toNano(1),
        bounce: false,
        body: new CommonMessageInfo({
          body: new CellMessage(body),
        }),
      })
    )
    if (res.logs) {
      throw new Error(res.logs)
    }
    expect(res.exit_code).toEqual(0)

    const data = await sale.getSaleData()
    expect(data.isComplete).toBe(true)
  })

  it('should ignore any message if completed', async () => {
    const conf: NftJettonFixpriceSaleV1Data = {
      ...defaultConfig,
      isComplete: true,
    }
    const sale = await NftJettonFixpriceSaleV1Local.createFromConfig(conf)

    const res = await sale.contract.sendInternalMessage(
      new InternalMessage({
        to: sale.address,
        from: conf.marketplaceAddress,
        value: toNano(1),
        bounce: false,
        body: new CommonMessageInfo({
          body: new CellMessage(new Cell()),
        }),
      })
    )
    if (res.logs) {
      throw new Error(res.logs)
    }
    expect(res.exit_code).not.toEqual(0)
  })

  it('should buy nft by TONs', async () => {
    const sale = await NftJettonFixpriceSaleV1Local.createFromConfig(defaultConfig)
    const buyerAddress = randomAddress()
    const res = await sale.contract.sendInternalMessage(
      new InternalMessage({
        to: sale.address,
        from: buyerAddress,
        value: toNano(2),
        bounce: false,
        body: new CommonMessageInfo({
          body: new CellMessage(new Cell()),
        }),
      })
    )
    if (res.logs) {
      throw new Error(res.logs)
    }
    expect(res.exit_code).toEqual(0)

    const data = await sale.getSaleData()
    expect(data.isComplete).toEqual(true)
    const nftTransfer = res.actionList.find(tx => {
      if (tx.type === 'send_msg') {
        if (tx.message.info.type === 'internal') {
          if (tx.message.info.dest?.toFriendly() === defaultConfig.nftAddress.toFriendly()) {
            const slice = tx.message.body.beginParse()
            const op = slice.readUint(32)
            slice.readUint(64) // query_id
            const newOwner = slice.readAddress()
            slice.readAddress() // response address
            slice.readUint(1) // custom payload = 0
            const forward = slice.readCoins() // forward amount
            if (op.eq(new BN(0x5fcc3d14)) && newOwner?.equals(buyerAddress) && forward.gte(toNano('0.03'))) {
              return true
            }
            return false
          }
        }
      }
    })

    expect(nftTransfer).toBeTruthy()

    const royaltiesFee = res.actionList.find(tx => {
      if (tx.type === 'send_msg') {
        if (tx.message.info.type === 'internal') {
          if (tx.message.info.dest?.toFriendly() === defaultConfig.royaltyAddress.toFriendly()) {
            return tx.message.info.value.coins.gte(defaultConfig.royaltyAmount)
          }
        }
      }
    })

    expect(royaltiesFee).toBeTruthy()

    const marketplaceFee = res.actionList.find(tx => {
      if (tx.type === 'send_msg') {
        if (tx.message.info.type === 'internal') {
          if (tx.message.info.dest?.toFriendly() === defaultConfig.marketplaceFeeAddress.toFriendly()) {
            return tx.message.info.value.coins.gte(defaultConfig.marketplaceFee)
          }
        }
      }
    })

    expect(marketplaceFee).toBeTruthy()

    const ownerTransfer = res.actionList.find(tx => {
      if (tx.type === 'send_msg') {
        if (tx.message.info.type === 'internal') {
          if (tx.message.info.dest?.toFriendly() === defaultConfig.nftOwnerAddress?.toFriendly()) {
            return tx.message.info.value.coins.gte(
              toNano(2).sub(defaultConfig.marketplaceFee).sub(defaultConfig.royaltyAmount).sub(toNano(1))
            )
          }
        }
      }
    })

    expect(ownerTransfer).toBeTruthy()
  })

  it('should buy nft by TONs without jettons', async () => {
    const sale = await NftJettonFixpriceSaleV1Local.createFromConfig({
      ...defaultConfig,
      jettonPrices: null
    })
    const buyerAddress = randomAddress()
    const res = await sale.contract.sendInternalMessage(
      new InternalMessage({
        to: sale.address,
        from: buyerAddress,
        value: toNano(2),
        bounce: false,
        body: new CommonMessageInfo({
          body: new CellMessage(new Cell()),
        }),
      })
    )
    if (res.logs) {
      throw new Error(res.logs)
    }
    expect(res.exit_code).toEqual(0)

    const data = await sale.getSaleData()
    expect(data.isComplete).toEqual(true)
    const nftTransfer = res.actionList.find(tx => {
      if (tx.type === 'send_msg') {
        if (tx.message.info.type === 'internal') {
          if (tx.message.info.dest?.toFriendly() === defaultConfig.nftAddress.toFriendly()) {
            const slice = tx.message.body.beginParse()
            const op = slice.readUint(32)
            slice.readUint(64) // query_id
            const newOwner = slice.readAddress()
            slice.readAddress() // response address
            slice.readUint(1) // custom payload = 0
            const forward = slice.readCoins() // forward amount
            if (op.eq(new BN(0x5fcc3d14)) && newOwner?.equals(buyerAddress) && forward.gte(toNano('0.03'))) {
              return true
            }
            return false
          }
        }
      }
    })

    expect(nftTransfer).toBeTruthy()

    const royaltiesFee = res.actionList.find(tx => {
      if (tx.type === 'send_msg') {
        if (tx.message.info.type === 'internal') {
          if (tx.message.info.dest?.toFriendly() === defaultConfig.royaltyAddress.toFriendly()) {
            return tx.message.info.value.coins.gte(defaultConfig.royaltyAmount)
          }
        }
      }
    })

    expect(royaltiesFee).toBeTruthy()

    const marketplaceFee = res.actionList.find(tx => {
      if (tx.type === 'send_msg') {
        if (tx.message.info.type === 'internal') {
          if (tx.message.info.dest?.toFriendly() === defaultConfig.marketplaceFeeAddress.toFriendly()) {
            return tx.message.info.value.coins.gte(defaultConfig.marketplaceFee)
          }
        }
      }
    })

    expect(marketplaceFee).toBeTruthy()

    const ownerTransfer = res.actionList.find(tx => {
      if (tx.type === 'send_msg') {
        if (tx.message.info.type === 'internal') {
          if (tx.message.info.dest?.toFriendly() === defaultConfig.nftOwnerAddress?.toFriendly()) {
            return tx.message.info.value.coins.gte(
              toNano(2).sub(defaultConfig.marketplaceFee).sub(defaultConfig.royaltyAmount).sub(toNano(1))
            )
          }
        }
      }
    })

    expect(ownerTransfer).toBeTruthy()
  })

  it('should not buy nft with empty TON price', async () => {
    const conf: NftJettonFixpriceSaleV1Data = {
      ...defaultConfig,
      fullPrice: toNano(0),
    }
    const sale = await NftJettonFixpriceSaleV1Local.createFromConfig(conf)
    const buyerAddress = randomAddress()
    const res = await sale.contract.sendInternalMessage(
      new InternalMessage({
        to: sale.address,
        from: buyerAddress,
        value: toNano(2),
        bounce: false,
        body: new CommonMessageInfo({
          body: new CellMessage(new Cell()),
        }),
      })
    )

    expect(res.exit_code).toEqual(451)
  });

  it('should buy only for allowed jettons', async () => {
    const buyerAddress = randomAddress();
    let randomQueryId = 227;

    for (let [jettonAddress, prices] of jettons) {
      const sale = await NftJettonFixpriceSaleV1Local.createFromConfig(defaultConfig);

      let forwardJettonPayload = beginCell()
        .storeUint(0x7362d09c, 32)
        .storeUint(++randomQueryId, 64)
        .storeCoins(prices.fullPrice)
        .storeAddress(buyerAddress)
        .endCell();
      let res = await sale.contract.sendInternalMessage(
        new InternalMessage({
          to: sale.address,
          from: jettonAddress,
          value: toNano(1),
          bounce: false,
          body: new CommonMessageInfo({
            body: new CellMessage(forwardJettonPayload),
          })
        })
      );

      expect(res.exit_code).toEqual(0);
      expect(res.actionList.length).toEqual(4);

      // Owner revenue
      {
        assert(res.actionList[0].type === 'send_msg');
        assert(res.actionList[0].message.info.type === 'internal')
        assertCoins(res.actionList[0].message.info.value.coins, toNano(0.04))
        expect(res.actionList[0].mode).toEqual(1);
        assertAddress(res.actionList[0].message.info.dest, jettonAddress);
        const slice = res.actionList[0].message.body.beginParse();
        assertCoins(slice.readUint(32), new BN(0xf8a7ea5)); // op
        expect(slice.readUintNumber(64)).toEqual(randomQueryId); // query_id
        assertCoins(slice.readCoins(), prices.fullPrice.sub(prices.marketplaceFee).sub(prices.royaltyAmount)); // amount
        assertAddress(slice.readAddress(), defaultConfig.nftOwnerAddress!); // address
        assertAddress(slice.readAddress(), buyerAddress); // response address
        expect(slice.readUintNumber(1)).toEqual(0); // custom payload = 0
        assertCoins(slice.readCoins(), toNano(0)); // forward amount
      }


      // Royalties fee
      {
        assert(res.actionList[1].type === 'send_msg');
        assert(res.actionList[1].message.info.type === 'internal')
        assertCoins(res.actionList[1].message.info.value.coins, toNano(0.04))
        expect(res.actionList[1].mode).toEqual(1);
        assertAddress(res.actionList[1].message.info.dest, jettonAddress);
        const slice = res.actionList[1].message.body.beginParse();
        assertCoins(slice.readUint(32), new BN(0xf8a7ea5)); // op
        expect(slice.readUintNumber(64)).toEqual(randomQueryId); // query_id
        assertCoins(slice.readCoins(), prices.royaltyAmount); // amount
        assertAddress(slice.readAddress(), defaultConfig.royaltyAddress); // address
        assertAddress(slice.readAddress(), buyerAddress); // response address
        expect(slice.readUintNumber(1)).toEqual(0); // custom payload = 0
        assertCoins(slice.readCoins(), toNano(0)); // forward amount
      }

      // Marketplace fee
      {
        assert(res.actionList[2].type === 'send_msg');
        assert(res.actionList[2].message.info.type === 'internal')
        assertCoins(res.actionList[2].message.info.value.coins, toNano(0.04))
        expect(res.actionList[2].mode).toEqual(1);
        assertAddress(res.actionList[2].message.info.dest, jettonAddress);
        const slice = res.actionList[2].message.body.beginParse();
        assertCoins(slice.readUint(32), new BN(0xf8a7ea5)); // op
        expect(slice.readUintNumber(64)).toEqual(randomQueryId); // query_id
        assertCoins(slice.readCoins(), prices.marketplaceFee); // amount
        assertAddress(slice.readAddress(), defaultConfig.marketplaceFeeAddress); // address
        assertAddress(slice.readAddress(), buyerAddress); // response address
        expect(slice.readUintNumber(1)).toEqual(0); // custom payload = 0
        assertCoins(slice.readCoins(), toNano(0)); // forward amount
      }


      // Nft transfer
      {
        assert(res.actionList[3].type === 'send_msg')
        expect(res.actionList[3].mode).toEqual(128);
        assertAddress(res.actionList[3].message.info.dest, defaultConfig.nftAddress)
        const slice = res.actionList[3].message.body.beginParse()
        assertCoins(slice.readUint(32), new BN(0x5fcc3d14)) // op
        expect(slice.readUintNumber(64)).toEqual(randomQueryId) // query_id
        assertAddress(slice.readAddress(), buyerAddress)  // new owner
        assertAddress(slice.readAddress(), buyerAddress)   // response address
        expect(slice.readUintNumber(1)).toEqual(0)
        const forward = slice.readCoins() // forward amount
        assert(forward.gte(toNano('0.03')))
      }
    }
  });

  it('should bounce jettons after finish', async () => {
    const buyerAddress = randomAddress();
    let randomQueryId = 227;

    let [jettonAddress, prices] = [...jettons.entries()][0];

    const sale = await NftJettonFixpriceSaleV1Local.createFromConfig(defaultConfig);
    sale.contract.setBalance(toNano(1));

    {
      let forwardJettonPayload = beginCell()
        .storeUint(0x7362d09c, 32)
        .storeUint(++randomQueryId, 64)
        .storeCoins(prices.fullPrice)
        .storeAddress(buyerAddress)
        .endCell();
      let res = await sale.contract.sendInternalMessage(
        new InternalMessage({
          to: sale.address,
          from: jettonAddress,
          value: toNano(1),
          bounce: false,
          body: new CommonMessageInfo({
            body: new CellMessage(forwardJettonPayload),
          })
        })
      );

      // Success sale
      expect(res.exit_code).toEqual(0);
      expect(res.actionList.length).toEqual(4);
    }


    let forwardJettonPayload = beginCell()
      .storeUint(0x7362d09c, 32)
      .storeUint(++randomQueryId, 64)
      .storeCoins(prices.fullPrice)
      .storeAddress(buyerAddress)
      .endCell();
    let res = await sale.contract.sendInternalMessage(
      new InternalMessage({
        to: sale.address,
        from: jettonAddress,
        value: toNano(1),
        bounce: false,
        body: new CommonMessageInfo({
          body: new CellMessage(forwardJettonPayload),
        })
      })
    );

    expect(res.exit_code).toEqual(0);
    expect(res.actionList.length).toEqual(1);

    {
      assert(res.actionList[0].type === 'send_msg');
      assert(res.actionList[0].message.info.type === 'internal')
      assertCoins(res.actionList[0].message.info.value.coins, toNano(0))
      expect(res.actionList[0].mode).toEqual(64);
      assertAddress(res.actionList[0].message.info.dest, jettonAddress);
      const slice = res.actionList[0].message.body.beginParse();
      assertCoins(slice.readUint(32), new BN(0xf8a7ea5)); // op
      expect(slice.readUintNumber(64)).toEqual(randomQueryId); // query_id
      assertCoins(slice.readCoins(), prices.fullPrice); // amount
      assertAddress(slice.readAddress(), buyerAddress); // address
      assertAddress(slice.readAddress(), buyerAddress); // response address
      expect(slice.readUintNumber(1)).toEqual(0); // custom payload = 0
      assertCoins(slice.readCoins(), toNano(0)); // forward amount
    }
  })

  it.each([
    [{
      ...defaultConfig,
      jettonsConfigured: false,
      jettonPrices: null,
    }],
    [{
      ...defaultConfig,
      jettonsConfigured: false,
      jettonPrices: null,
      nftOwnerAddress: null,
    }],
    [{
      ...defaultConfig,
      nftOwnerAddress: null,
    }]
  ])('should bounce jettons if not initialized', async (config: NftJettonFixpriceSaleV1Data) => {
    const buyerAddress = randomAddress();
    let randomQueryId = 227;

    let [jettonAddress, prices] = [...jettons.entries()][0];

    const sale = await NftJettonFixpriceSaleV1Local.createFromConfig(config)


    let forwardJettonPayload = beginCell()
      .storeUint(0x7362d09c, 32)
      .storeUint(++randomQueryId, 64)
      .storeCoins(prices.fullPrice)
      .storeAddress(buyerAddress)
      .endCell();
    let res = await sale.contract.sendInternalMessage(
      new InternalMessage({
        to: sale.address,
        from: jettonAddress,
        value: toNano(1),
        bounce: false,
        body: new CommonMessageInfo({
          body: new CellMessage(forwardJettonPayload),
        })
      })
    );

    expect(res.exit_code).toEqual(0);
    expect(res.actionList.length).toEqual(1);

    {
      assert(res.actionList[0].type === 'send_msg');
      assert(res.actionList[0].message.info.type === 'internal')
      assertCoins(res.actionList[0].message.info.value.coins, toNano(0))
      expect(res.actionList[0].mode).toEqual(64);
      assertAddress(res.actionList[0].message.info.dest, jettonAddress);
      const slice = res.actionList[0].message.body.beginParse();
      assertCoins(slice.readUint(32), new BN(0xf8a7ea5)); // op
      expect(slice.readUintNumber(64)).toEqual(randomQueryId); // query_id
      assertCoins(slice.readCoins(), prices.fullPrice); // amount
      assertAddress(slice.readAddress(), buyerAddress); // address
      assertAddress(slice.readAddress(), buyerAddress); // response address
      expect(slice.readUintNumber(1)).toEqual(0); // custom payload = 0
      assertCoins(slice.readCoins(), toNano(0)); // forward amount
    }
  })

  it('should forward TONs from balance to owner', async () => {
    const buyerAddress = randomAddress();
    let randomQueryId = 227;

    let [jettonAddress, prices] = [...jettons.entries()][0];

    const sale = await NftJettonFixpriceSaleV1Local.createFromConfig(defaultConfig);
    sale.contract.setBalance(toNano(1));


    let forwardJettonPayload = beginCell()
      .storeUint(0x7362d09c, 32)
      .storeUint(++randomQueryId, 64)
      .storeCoins(prices.fullPrice)
      .storeAddress(buyerAddress)
      .endCell();
    let res = await sale.contract.sendInternalMessage(
      new InternalMessage({
        to: sale.address,
        from: jettonAddress,
        value: toNano(1),
        bounce: false,
        body: new CommonMessageInfo({
          body: new CellMessage(forwardJettonPayload),
        })
      })
    );

    expect(res.exit_code).toEqual(0);
    expect(res.actionList.length).toEqual(4);

    // Owner revenue
    {
      assert(res.actionList[0].type === 'send_msg');
      assert(res.actionList[0].message.info.type === 'internal');
      assertCoins(res.actionList[0].message.info.value.coins, toNano(0.04));
      expect(res.actionList[0].mode).toEqual(1);
      assertAddress(res.actionList[0].message.info.dest, jettonAddress);
      const slice = res.actionList[0].message.body.beginParse();
      assertCoins(slice.readUint(32), new BN(0xf8a7ea5)); // op
      expect(slice.readUintNumber(64)).toEqual(randomQueryId); // query_id
      assertCoins(slice.readCoins(), prices.fullPrice.sub(prices.marketplaceFee).sub(prices.royaltyAmount)); // amount
      assertAddress(slice.readAddress(), defaultConfig.nftOwnerAddress!); // address
      assertAddress(slice.readAddress(), buyerAddress); // response address
      expect(slice.readUintNumber(1)).toEqual(0); // custom payload = 0
      assertCoins(slice.readCoins(), toNano(1)); // forward amount
    }


    // Royalties fee
    {
      assert(res.actionList[1].type === 'send_msg');
      assert(res.actionList[1].message.info.type === 'internal');
      assertCoins(res.actionList[1].message.info.value.coins, toNano(0.04));
      expect(res.actionList[1].mode).toEqual(1);
      assertAddress(res.actionList[1].message.info.dest, jettonAddress);
      const slice = res.actionList[1].message.body.beginParse();
      assertCoins(slice.readUint(32), new BN(0xf8a7ea5)); // op
      expect(slice.readUintNumber(64)).toEqual(randomQueryId); // query_id
      assertCoins(slice.readCoins(), prices.royaltyAmount); // amount
      assertAddress(slice.readAddress(), defaultConfig.royaltyAddress); // address
      assertAddress(slice.readAddress(), buyerAddress); // response address
      expect(slice.readUintNumber(1)).toEqual(0); // custom payload = 0
      assertCoins(slice.readCoins(), toNano(0)); // forward amount
    }

    // Marketplace fee
    {
      assert(res.actionList[2].type === 'send_msg');
      assert(res.actionList[2].message.info.type === 'internal');
      assertCoins(res.actionList[2].message.info.value.coins, toNano(0.04));
      expect(res.actionList[2].mode).toEqual(1);
      assertAddress(res.actionList[2].message.info.dest, jettonAddress);
      const slice = res.actionList[2].message.body.beginParse();
      assertCoins(slice.readUint(32), new BN(0xf8a7ea5)); // op
      expect(slice.readUintNumber(64)).toEqual(randomQueryId); // query_id
      assertCoins(slice.readCoins(), prices.marketplaceFee); // amount
      assertAddress(slice.readAddress(), defaultConfig.marketplaceFeeAddress); // address
      assertAddress(slice.readAddress(), buyerAddress); // response address
      expect(slice.readUintNumber(1)).toEqual(0); // custom payload = 0
      assertCoins(slice.readCoins(), toNano(0)); // forward amount
    }


    // Nft transfer
    {
      assert(res.actionList[3].type === 'send_msg')
      expect(res.actionList[3].mode).toEqual(128);
      assertAddress(res.actionList[3].message.info.dest, defaultConfig.nftAddress)
      const slice = res.actionList[3].message.body.beginParse()
      assertCoins(slice.readUint(32), new BN(0x5fcc3d14)) // op
      expect(slice.readUintNumber(64)).toEqual(randomQueryId) // query_id
      assertAddress(slice.readAddress(), buyerAddress)  // new owner
      assertAddress(slice.readAddress(), buyerAddress)   // response address
      expect(slice.readUintNumber(1)).toEqual(0)
      const forward = slice.readCoins() // forward amount
      assert(forward.gte(toNano('0.03')))
    }
  })

  it('should return extra jettons', async () => {
    const buyerAddress = randomAddress();
    let randomQueryId = 227;

    let [jettonAddress, prices] = [...jettons.entries()][0];

    const sale = await NftJettonFixpriceSaleV1Local.createFromConfig(defaultConfig);
    sale.contract.setBalance(toNano(1));


    let forwardJettonPayload = beginCell()
      .storeUint(0x7362d09c, 32)
      .storeUint(++randomQueryId, 64)
      .storeCoins(prices.fullPrice.mul(new BN(3)))
      .storeAddress(buyerAddress)
      .endCell();
    let res = await sale.contract.sendInternalMessage(
      new InternalMessage({
        to: sale.address,
        from: jettonAddress,
        value: toNano(1),
        bounce: false,
        body: new CommonMessageInfo({
          body: new CellMessage(forwardJettonPayload),
        })
      })
    );

    expect(res.exit_code).toEqual(0);
    expect(res.actionList.length).toEqual(5);


    // Owner revenue
    {
      assert(res.actionList[0].type === 'send_msg');
      assert(res.actionList[0].message.info.type === 'internal')
      assertCoins(res.actionList[0].message.info.value.coins, toNano(0.04))
      expect(res.actionList[0].mode).toEqual(1);
      assertAddress(res.actionList[0].message.info.dest, jettonAddress);
      const slice = res.actionList[0].message.body.beginParse();
      assertCoins(slice.readUint(32), new BN(0xf8a7ea5)); // op
      expect(slice.readUintNumber(64)).toEqual(randomQueryId); // query_id
      assertCoins(slice.readCoins(), prices.fullPrice.sub(prices.marketplaceFee).sub(prices.royaltyAmount)); // amount
      assertAddress(slice.readAddress(), defaultConfig.nftOwnerAddress!); // address
      assertAddress(slice.readAddress(), buyerAddress); // response address
      expect(slice.readUintNumber(1)).toEqual(0); // custom payload = 0
      assertCoins(slice.readCoins(), toNano(1)); // forward amount
    }


    // Royalties fee
    {
      assert(res.actionList[1].type === 'send_msg');
      assert(res.actionList[1].message.info.type === 'internal')
      assertCoins(res.actionList[1].message.info.value.coins, toNano(0.04))
      expect(res.actionList[1].mode).toEqual(1);
      assertAddress(res.actionList[1].message.info.dest, jettonAddress);
      const slice = res.actionList[1].message.body.beginParse();
      assertCoins(slice.readUint(32), new BN(0xf8a7ea5)); // op
      expect(slice.readUintNumber(64)).toEqual(randomQueryId); // query_id
      assertCoins(slice.readCoins(), prices.royaltyAmount); // amount
      assertAddress(slice.readAddress(), defaultConfig.royaltyAddress); // address
      assertAddress(slice.readAddress(), buyerAddress); // response address
      expect(slice.readUintNumber(1)).toEqual(0); // custom payload = 0
      assertCoins(slice.readCoins(), toNano(0)); // forward amount
    }

    // Marketplace fee
    {
      assert(res.actionList[2].type === 'send_msg');
      assert(res.actionList[2].message.info.type === 'internal')
      assertCoins(res.actionList[2].message.info.value.coins, toNano(0.04))
      expect(res.actionList[2].mode).toEqual(1);
      assertAddress(res.actionList[2].message.info.dest, jettonAddress);
      const slice = res.actionList[2].message.body.beginParse();
      assertCoins(slice.readUint(32), new BN(0xf8a7ea5)); // op
      expect(slice.readUintNumber(64)).toEqual(randomQueryId); // query_id
      assertCoins(slice.readCoins(), prices.marketplaceFee); // amount
      assertAddress(slice.readAddress(), defaultConfig.marketplaceFeeAddress); // address
      assertAddress(slice.readAddress(), buyerAddress); // response address
      expect(slice.readUintNumber(1)).toEqual(0); // custom payload = 0
      assertCoins(slice.readCoins(), toNano(0)); // forward amount
    }


    // Sender cashback
    {
      assert(res.actionList[3].type === 'send_msg');
      assert(res.actionList[3].message.info.type === 'internal')
      assertCoins(res.actionList[3].message.info.value.coins, toNano(0.04))
      expect(res.actionList[3].mode).toEqual(1);
      assertAddress(res.actionList[3].message.info.dest, jettonAddress);
      const slice = res.actionList[3].message.body.beginParse();
      assertCoins(slice.readUint(32), new BN(0xf8a7ea5)); // op
      expect(slice.readUintNumber(64)).toEqual(randomQueryId); // query_id
      assertCoins(slice.readCoins(), prices.fullPrice.mul(new BN(2))); // amount
      assertAddress(slice.readAddress(), buyerAddress); // address
      assertAddress(slice.readAddress(), buyerAddress); // response address
      expect(slice.readUintNumber(1)).toEqual(0); // custom payload = 0
      assertCoins(slice.readCoins(), toNano(0)); // forward amount
    }


    // Nft transfer
    {
      assert(res.actionList[4].type === 'send_msg')
      expect(res.actionList[4].mode).toEqual(128);
      assertAddress(res.actionList[4].message.info.dest, defaultConfig.nftAddress)
      const slice = res.actionList[4].message.body.beginParse()
      assertCoins(slice.readUint(32), new BN(0x5fcc3d14)) // op
      expect(slice.readUintNumber(64)).toEqual(randomQueryId) // query_id
      assertAddress(slice.readAddress(), buyerAddress)  // new owner
      assertAddress(slice.readAddress(), buyerAddress)   // response address
      expect(slice.readUintNumber(1)).toEqual(0)
      const forward = slice.readCoins() // forward amount
      assert(forward.gte(toNano('0.03')))
    }
  })

  it('should bounce unknown jettons', async () => {
    const buyerAddress = randomAddress();
    let randomQueryId = 227;

    let jettonAddress = randomAddress();
    let amount = toNano(1);

    const sale = await NftJettonFixpriceSaleV1Local.createFromConfig(defaultConfig);
    sale.contract.setBalance(toNano(1));


    let forwardJettonPayload = beginCell()
      .storeUint(0x7362d09c, 32)
      .storeUint(++randomQueryId, 64)
      .storeCoins(amount)
      .storeAddress(buyerAddress)
      .endCell();
    let res = await sale.contract.sendInternalMessage(
      new InternalMessage({
        to: sale.address,
        from: jettonAddress,
        value: toNano(1),
        bounce: false,
        body: new CommonMessageInfo({
          body: new CellMessage(forwardJettonPayload),
        })
      })
    );

    expect(res.exit_code).toEqual(0);
    expect(res.actionList.length).toEqual(1);


    // Owner revenue
    {
      assert(res.actionList[0].type === 'send_msg');
      expect(res.actionList[0].mode).toEqual(64);
      assert(res.actionList[0].message.info.type === 'internal')
      assertCoins(res.actionList[0].message.info.value.coins, toNano(0))
      assertAddress(res.actionList[0].message.info.dest, jettonAddress);
      const slice = res.actionList[0].message.body.beginParse();
      assertCoins(slice.readUint(32), new BN(0xf8a7ea5)); // op
      expect(slice.readUintNumber(64)).toEqual(randomQueryId); // query_id
      assertCoins(slice.readCoins(), amount); // amount
      assertAddress(slice.readAddress(), buyerAddress); // address
      assertAddress(slice.readAddress(), buyerAddress); // response address
      expect(slice.readUintNumber(1)).toEqual(0); // custom payload = 0
      assertCoins(slice.readCoins(), toNano(0)); // forward amount
    }
  })

  it('should bounce jettons if smaller amount', async () => {
    const buyerAddress = randomAddress();
    let randomQueryId = 227;

    let [jettonAddress, prices] = [...jettons.entries()][0];

    const sale = await NftJettonFixpriceSaleV1Local.createFromConfig(defaultConfig);
    sale.contract.setBalance(toNano(1));


    let forwardJettonPayload = beginCell()
      .storeUint(0x7362d09c, 32)
      .storeUint(++randomQueryId, 64)
      .storeCoins(prices.fullPrice.divRound(new BN(2)))
      .storeAddress(buyerAddress)
      .endCell();
    let res = await sale.contract.sendInternalMessage(
      new InternalMessage({
        to: sale.address,
        from: jettonAddress,
        value: toNano(1),
        bounce: false,
        body: new CommonMessageInfo({
          body: new CellMessage(forwardJettonPayload),
        })
      })
    );

    expect(res.exit_code).toEqual(0);
    expect(res.actionList.length).toEqual(1);


    // Owner revenue
    {
      assert(res.actionList[0].type === 'send_msg');
      expect(res.actionList[0].mode).toEqual(64);
      assert(res.actionList[0].message.info.type === 'internal')
      assertCoins(res.actionList[0].message.info.value.coins, toNano(0))
      assertAddress(res.actionList[0].message.info.dest, jettonAddress);
      const slice = res.actionList[0].message.body.beginParse();
      assertCoins(slice.readUint(32), new BN(0xf8a7ea5)); // op
      expect(slice.readUintNumber(64)).toEqual(randomQueryId); // query_id
      assertCoins(slice.readCoins(), prices.fullPrice.divRound(new BN(2))); // amount
      assertAddress(slice.readAddress(), buyerAddress); // address
      assertAddress(slice.readAddress(), buyerAddress); // response address
      expect(slice.readUintNumber(1)).toEqual(0); // custom payload = 0
      assertCoins(slice.readCoins(), toNano(0)); // forward amount
    }
  })

  it('should allow cancel after buy', async () => {
    const sale = await NftJettonFixpriceSaleV1Local.createFromConfig(defaultConfig)
    const buyerAddress = randomAddress()
    let res = await sale.contract.sendInternalMessage(
      new InternalMessage({
        to: sale.address,
        from: buyerAddress,
        value: toNano(2),
        bounce: false,
        body: new CommonMessageInfo({
          body: new CellMessage(new Cell()),
        }),
      })
    )
    if (res.logs) {
      throw new Error(res.logs)
    }
    expect(res.exit_code).toEqual(0)

    const data = await sale.getSaleData()
    expect(data.isComplete).toEqual(true) // check buy success

    const cancelMessage = new Cell()
    cancelMessage.bits.writeUint(3, 32) // op
    cancelMessage.bits.writeUint(0, 64) // query_id

    res = await sale.contract.sendInternalMessage(
      new InternalMessage({
        to: sale.address,
        from: defaultConfig.nftOwnerAddress,
        value: toNano(1),
        bounce: false,
        body: new CommonMessageInfo({
          body: new CellMessage(cancelMessage),
        }),
      })
    )
    if (res.logs) {
      throw new Error(res.logs)
    }
    expect(res.exit_code).toEqual(0)

    const nftTransfer = res.actionList.find(tx => {
      if (tx.type === 'send_msg') {
        if (tx.message.info.type === 'internal') {
          if (tx.message.info.dest?.toFriendly() === defaultConfig.nftAddress.toFriendly()) {
            const slice = tx.message.body.beginParse()
            const op = slice.readUint(32)
            slice.readUint(64) // query_id
            const newOwner = slice.readAddress()
            if (op.eq(new BN(0x5fcc3d14)) && newOwner?.equals(defaultConfig.nftOwnerAddress!)) {
              return true
            }
            return false
          }
        }
      }
    })

    expect(nftTransfer).toBeTruthy()
  })

  it('should allow emergency transfer after end', async () => {
    const sale = await NftJettonFixpriceSaleV1Local.createFromConfig({
      ...defaultConfig,
    })
    const transfer = new Builder()
    transfer.storeUint(0x18, 6)
    transfer.storeAddress(defaultConfig.marketplaceAddress)
    transfer.storeCoins(toNano('0.666'))
    transfer.storeUint(1, 1 + 4 + 4 + 64 + 32 + 1 + 1)
    transfer.storeRef(new Builder().storeUint(666, 32).endCell())

    const transferBox = new Builder()
    transferBox.storeUint(2, 8)
    transferBox.storeRef(transfer.endCell())

    const msgResend = new Builder()
    msgResend.storeUint(555, 32) // op
    msgResend.storeUint(0, 64) // query_id
    msgResend.storeRef(transferBox.endCell())

    const msg = msgResend.endCell()
    let res = await sale.contract.sendInternalMessage(
      new InternalMessage({
        to: sale.address,
        from: defaultConfig.marketplaceAddress,
        value: toNano('0.1'),
        bounce: true,
        body: new CommonMessageInfo({
          body: new CellMessage(msg),
        }),
      })
    )

    expect(res.exit_code).not.toEqual(0) // sale not end, ignore payload

    // buy message
    await sale.contract.sendInternalMessage(
      new InternalMessage({
        to: sale.address,
        from: randomAddress(),
        value: toNano('2'),
        bounce: true,
        body: new CommonMessageInfo({
          body: new CellMessage(new Cell()),
        }),
      })
    )

    res = await sale.contract.sendInternalMessage(
      new InternalMessage({
        to: sale.address,
        from: randomAddress(),
        value: toNano('0.1'),
        bounce: true,
        body: new CommonMessageInfo({
          body: new CellMessage(msg),
        }),
      })
    )

    expect(res.exit_code).not.toEqual(0) // msg not from marketplace, ignore payload

    res = await sale.contract.sendInternalMessage(
      new InternalMessage({
        to: sale.address,
        from: defaultConfig.marketplaceAddress,
        value: toNano('0.1'),
        bounce: true,
        body: new CommonMessageInfo({
          body: new CellMessage(msg),
        }),
      })
    )

    expect(res.exit_code).toEqual(0) // accept message
    expect(res.actionList.length).toBe(1)

    const requestedTx = res.actionList.find(tx => {
      if (tx.type === 'send_msg') {
        if (tx.message.info.type === 'internal') {
          if (tx.message.info.dest?.toFriendly() === defaultConfig.marketplaceAddress.toFriendly()) {
            const slice = tx.message.body.beginParse()
            const op = slice.readUint(32)
            if (op.eq(new BN(666))) {
              return true
            }
            return false
          }
        }
      }
    })

    expect(requestedTx).toBeTruthy()
  })
})
