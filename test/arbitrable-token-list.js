/* eslint-disable no-undef */ // Avoid the linter considering truffle elements as undef.

/**
 * NOTE: Tests were adapted from arbitrable-permission-list. As of 04/10/18 t2cr spec, the
 * contract is a white list, not append-only and rechallenges are not possible.
 *
 * Tests that checked for other combinations were removed.
 *
 * TODO: Write tests for other combination of constructor parameters’
 */

const BigNumber = web3.BigNumber
const {
  expectThrow
} = require('openzeppelin-solidity/test/helpers/expectThrow')

const ArbitrableTokenList = artifacts.require('./ArbitrableTokenList.sol')
const CentralizedArbitrator = artifacts.require('./CentralizedArbitrator.sol')

contract('ArbitrableTokenList', function(accounts) {
  const arbitrator = accounts[1]
  const partyA = accounts[2]
  const partyB = accounts[3]
  const arbitratorExtraData = 0x08575
  const arbitrationFee = 4
  const stake = 10
  const timeToChallenge = 0
  const metaEvidence = 'evidence'
  const feeGovernor = accounts[1]
  const feeStake = 10
  const halfOfArbitrationPrice = arbitrationFee / 2

  let centralizedArbitrator
  let arbitrableTokenList
  let arbitrationCost

  const ITEM_STATUS = {
    ABSENT: 0,
    CLEARED: 1,
    RESUBMITTED: 2,
    REGISTERED: 3,
    SUBMITTED: 4,
    CLEARING_REQUESTED: 5,
    PREVENTIVE_CLEARING_REQUESTED: 6
  }

  const RULING = {
    OTHER: 0,
    REGISTER: 1,
    CLEAR: 2
  }

  const ARBITRARY_STRING = 'abc'

  const REQUEST = {
    ID: ARBITRARY_STRING,
    arbitrationFeesWaitingTime: 60,
    timeOut: 60,
    contributionsPerSide: [
      [halfOfArbitrationPrice - 1, halfOfArbitrationPrice - 1]
    ]
  }

  const blacklist = false
  const appendOnly = false
  const rechallengePossible = false

  describe('queryItems', function() {
    before('setup contract for each test', async () => {
      centralizedArbitrator = await CentralizedArbitrator.new(arbitrationFee, {
        from: arbitrator
      })

      arbitrableTokenList = await ArbitrableTokenList.new(
        centralizedArbitrator.address,
        arbitratorExtraData,
        metaEvidence,
        blacklist,
        appendOnly,
        rechallengePossible,
        stake,
        timeToChallenge,
        feeGovernor,
        feeStake,
        {
          from: arbitrator
        }
      )

      arbitrationCost = (await centralizedArbitrator.arbitrationCost.call(
        'as',
        {
          from: arbitrator
        }
      )).toNumber()
    })

    before('populate the list', async function() {
      await arbitrableTokenList.requestRegistration(
        ARBITRARY_STRING,
        metaEvidence,
        REQUEST.arbitrationFeesWaitingTime,
        centralizedArbitrator.address,
        {
          from: partyA,
          value: stake + arbitrationCost
        }
      )
    })

    it('should succesfully retrieve mySubmissions', async function() {
      const cursor = 0
      const count = 1

      const pending = false
      const challenged = false
      const accepted = false
      const rejected = false
      const mySubmissions = true
      const myChallenges = false

      const filter = [
        pending,
        challenged,
        accepted,
        rejected,
        mySubmissions,
        myChallenges
      ]
      const sort = true

      const item = (await arbitrableTokenList.queryItems(
        cursor,
        count,
        filter,
        sort,
        {
          from: partyA
        }
      ))[0]

      assert.equal(web3.toUtf8(item[0]), ARBITRARY_STRING)
    })

    it('should succesfully retrieve pending', async function() {
      const cursor = 0
      const count = 1

      const pending = true
      const challenged = false
      const accepted = false
      const rejected = false
      const mySubmissions = false
      const myChallenges = false

      const filter = [
        pending,
        challenged,
        accepted,
        rejected,
        mySubmissions,
        myChallenges
      ]
      const sort = true

      const item = (await arbitrableTokenList.queryItems(
        cursor,
        count,
        filter,
        sort,
        {
          from: partyA
        }
      ))[0]

      assert.equal(web3.toUtf8(item[0]), ARBITRARY_STRING)
    })

    it('should revert when not cursor < itemsList.length', async function() {
      const cursor = 1
      const count = 1

      const pending = true
      const challenged = false
      const accepted = false
      const rejected = false
      const mySubmissions = false
      const myChallenges = false

      const filter = [
        pending,
        challenged,
        accepted,
        rejected,
        mySubmissions,
        myChallenges
      ]
      const sort = true

      await expectThrow(
        arbitrableTokenList.queryItems(cursor, count, filter, sort, {
          from: partyA
        })
      )
    })
  })

  describe(
    'When appendOnly=' +
      appendOnly +
      ', blacklist=' +
      blacklist +
      ', rechallengePossible=' +
      rechallengePossible,
    // eslint-disable-next-line no-loop-func
    () => {
      beforeEach('setup contract for each test', async () => {
        centralizedArbitrator = await CentralizedArbitrator.new(
          arbitrationFee,
          {
            from: arbitrator
          }
        )

        arbitrableTokenList = await ArbitrableTokenList.new(
          centralizedArbitrator.address,
          arbitratorExtraData,
          metaEvidence,
          blacklist,
          appendOnly,
          rechallengePossible,
          stake,
          timeToChallenge,
          feeGovernor,
          feeStake,
          {
            from: arbitrator
          }
        )

        arbitrationCost = (await centralizedArbitrator.arbitrationCost.call(
          'as',
          {
            from: arbitrator
          }
        )).toNumber()
      })

      it('should be constructed correctly', async () => {
        assert.equal(
          await arbitrableTokenList.arbitrator(),
          centralizedArbitrator.address
        )
        assert.equal(
          await arbitrableTokenList.arbitratorExtraData(),
          arbitratorExtraData
        )
        assert.equal(await arbitrableTokenList.blacklist(), blacklist)
        assert.equal(await arbitrableTokenList.appendOnly(), appendOnly)
        assert.equal(
          await arbitrableTokenList.rechallengePossible(),
          rechallengePossible
        )
        assert.equal(await arbitrableTokenList.stake(), stake)
        assert.equal(
          await arbitrableTokenList.timeToChallenge(),
          timeToChallenge
        )
      })

      describe('msg.value restrictions', function() {
        describe('Should revert when msg.value < stake+arbitratorCost', function() {
          it('requestRegistration', async () => {
            await expectThrow(
              arbitrableTokenList.requestRegistration(
                ARBITRARY_STRING,
                metaEvidence,
                REQUEST.arbitrationFeesWaitingTime,
                centralizedArbitrator.address,
                {
                  from: arbitrator,
                  value: stake + arbitrationCost - 1
                }
              )
            )
          })

          it('requestClearing', async () => {
            await expectThrow(
              arbitrableTokenList.requestClearing(
                ARBITRARY_STRING,
                metaEvidence,
                REQUEST.arbitrationFeesWaitingTime,
                centralizedArbitrator.address,
                {
                  from: arbitrator,
                  value: stake + arbitrationCost - 1
                }
              )
            )
          })

          it('challengeRegistration', async () => {
            await expectThrow(
              arbitrableTokenList.challengeRegistration(ARBITRARY_STRING, {
                from: arbitrator,
                value: stake + arbitrationCost - 1
              })
            )
          })

          it('challengeClearing', async () => {
            await expectThrow(
              arbitrableTokenList.challengeRegistration(ARBITRARY_STRING, {
                from: arbitrator,
                value: stake + arbitrationCost - 1
              })
            )
          })
        })
      })

      describe('When item.disputed', function() {
        beforeEach(
          'prepare pre-conditions to satisfy other requirements',
          async function() {
            await arbitrableTokenList.requestRegistration(
              ARBITRARY_STRING,
              metaEvidence,
              REQUEST.arbitrationFeesWaitingTime,
              centralizedArbitrator.address,
              {
                from: arbitrator,
                value: stake + arbitrationCost
              }
            ) // To satisfy `require(item.status==ItemStatus.Resubmitted || item.status==ItemStatus.Submitted)`

            await arbitrableTokenList.challengeRegistration(ARBITRARY_STRING, {
              from: arbitrator,
              value: stake + arbitrationCost
            }) // To dissatisfy `require(!item.disputed)`
          }
        )

        beforeEach('assert pre-conditions', async function() {
          assert.ok(
            (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[0].toNumber() === ITEM_STATUS.SUBMITTED ||
              (await arbitrableTokenList.items(
                ARBITRARY_STRING
              ))[0].toNumber() === ITEM_STATUS.RESUBMITTED
          )

          assert.equal(
            (await arbitrableTokenList.items(ARBITRARY_STRING))[5],
            true
          )
        })
        it('challengeRegistration', async () => {
          await expectThrow(
            arbitrableTokenList.challengeRegistration(ARBITRARY_STRING, {
              from: arbitrator,
              value: stake + arbitrationCost
            })
          )
        })

        it('challengeClearing', async () => {
          await expectThrow(
            arbitrableTokenList.challengeClearing(ARBITRARY_STRING, {
              from: arbitrator,
              value: stake + arbitrationCost
            })
          )
        })
      })

      describe('When !(item.status==ItemStatus.ClearingRequested || item.status==ItemStatus.PreventiveClearingRequested))', function() {
        beforeEach('assert pre-conditions', async function() {
          assert.ok(
            (await arbitrableTokenList.items(ARBITRARY_STRING))[0] <
              ITEM_STATUS.CLEARING_REQUESTED
          )
        })

        it('challengeRegistration', async function() {
          await expectThrow(
            arbitrableTokenList.challengeRegistration(ARBITRARY_STRING, {
              from: arbitrator,
              value: stake + arbitrationCost
            })
          )
        })

        it('challengeClearing', async function() {
          await expectThrow(
            arbitrableTokenList.challengeClearing(ARBITRARY_STRING, {
              from: arbitrator,
              value: stake + arbitrationCost
            })
          )
        })
      })

      describe('When item in absent state', function() {
        beforeEach('assert pre-conditions', async function() {
          assert.equal(
            (await arbitrableTokenList.items(ARBITRARY_STRING))[0],
            ITEM_STATUS.ABSENT
          )
        })

        it('calling isPermitted should return ' + blacklist, async () => {
          assert.equal(
            await arbitrableTokenList.isPermitted(ARBITRARY_STRING),
            blacklist
          )
        })

        it('calling requestRegistration should move item into the submitted state', async () => {
          await arbitrableTokenList.requestRegistration(
            ARBITRARY_STRING,
            metaEvidence,
            REQUEST.arbitrationFeesWaitingTime,
            centralizedArbitrator.address,
            {
              from: arbitrator,
              value: stake + arbitrationCost
            }
          )

          assert.equal(
            (await arbitrableTokenList.items(ARBITRARY_STRING))[0],
            ITEM_STATUS.SUBMITTED
          )
        })

        it('calling requestClearing should move item into the preventive clearing requested state', async () => {
          await arbitrableTokenList.requestClearing(
            ARBITRARY_STRING,
            metaEvidence,
            REQUEST.arbitrationFeesWaitingTime,
            centralizedArbitrator.address,
            {
              from: arbitrator,
              value: stake + arbitrationCost
            }
          )

          assert.equal(
            (await arbitrableTokenList.items(ARBITRARY_STRING))[0].toNumber(),
            ITEM_STATUS.PREVENTIVE_CLEARING_REQUESTED
          )
        })

        it('calling challangeBlacklisting should revert', async () => {
          await expectThrow(
            arbitrableTokenList.challengeRegistration(ARBITRARY_STRING, {
              from: arbitrator,
              value: stake + arbitrationCost
            })
          )
        })

        it('calling challangeClearing should revert', async () => {
          await expectThrow(
            arbitrableTokenList.challengeClearing(ARBITRARY_STRING, {
              from: arbitrator,
              value: stake + arbitrationCost
            })
          )
        })

        it('calling executeRequest should revert', async () => {
          await expectThrow(
            arbitrableTokenList.executeRequest(ARBITRARY_STRING, {
              from: arbitrator
            })
          )
        })
      })

      describe.skip('When item in cleared state', function() {
        beforeEach('prepare pre-conditions', async function() {
          await arbitrableTokenList.requestRegistration(
            ARBITRARY_STRING,
            metaEvidence,
            REQUEST.arbitrationFeesWaitingTime,
            centralizedArbitrator.address,
            {
              from: arbitrator,
              value: stake + arbitrationCost
            }
          )
          console.info('calling executeRequest')
          await arbitrableTokenList.executeRequest(ARBITRARY_STRING, {
            from: arbitrator
          })
          console.info('calling requestClearing')
          await arbitrableTokenList.requestClearing(
            ARBITRARY_STRING,
            metaEvidence,
            REQUEST.arbitrationFeesWaitingTime,
            centralizedArbitrator.address,
            {
              from: arbitrator,
              value: stake + arbitrationCost
            }
          )
          await arbitrableTokenList.executeRequest(ARBITRARY_STRING, {
            from: arbitrator
          })
        })

        beforeEach('assert pre-conditions', async function() {
          assert.equal(
            (await arbitrableTokenList.items(ARBITRARY_STRING))[0],
            ITEM_STATUS.CLEARED
          )
        })

        it('calling isPermitted should return ' + blacklist, async () => {
          assert.equal(
            await arbitrableTokenList.isPermitted(ARBITRARY_STRING),
            blacklist
          )
        })

        it('calling requestRegistration should move item into the resubmitted state', async () => {
          await arbitrableTokenList.requestRegistration(
            ARBITRARY_STRING,
            metaEvidence,
            REQUEST.arbitrationFeesWaitingTime,
            centralizedArbitrator.address,
            {
              from: arbitrator,
              value: stake + arbitrationCost
            }
          )

          assert.equal(
            (await arbitrableTokenList.items(ARBITRARY_STRING))[0].toNumber(),
            ITEM_STATUS.RESUBMITTED
          )
        })

        it('calling requestClearing should revert', async () => {
          await expectThrow(
            arbitrableTokenList.requestClearing(
              ARBITRARY_STRING,
              metaEvidence,
              REQUEST.arbitrationFeesWaitingTime,
              centralizedArbitrator.address,
              {
                from: arbitrator,
                value: stake + arbitrationCost
              }
            )
          )
        })

        it('calling challangeBlacklisting should revert', async () => {
          await expectThrow(
            arbitrableTokenList.challengeRegistration(ARBITRARY_STRING, {
              from: arbitrator,
              value: stake + arbitrationCost
            })
          )
        })

        it('calling challangeClearing should revert', async () => {
          await expectThrow(
            arbitrableTokenList.challengeClearing(ARBITRARY_STRING, {
              from: arbitrator,
              value: stake + arbitrationCost
            })
          )
        })

        it('calling executeRequest should revert', async () => {
          await expectThrow(
            arbitrableTokenList.executeRequest(ARBITRARY_STRING, {
              from: arbitrator
            })
          )
        })
      })

      describe.skip('When item in resubmitted state', function() {
        beforeEach('prepare pre-conditions', async function() {
          await arbitrableTokenList.requestRegistration(
            ARBITRARY_STRING,
            metaEvidence,
            REQUEST.arbitrationFeesWaitingTime,
            centralizedArbitrator.address,
            {
              from: partyA,
              value: stake + arbitrationCost
            }
          )
          await arbitrableTokenList.executeRequest(ARBITRARY_STRING, {
            from: partyA
          })
          await arbitrableTokenList.requestClearing(
            ARBITRARY_STRING,
            metaEvidence,
            REQUEST.arbitrationFeesWaitingTime,
            centralizedArbitrator.address,
            {
              from: partyB,
              value: stake + arbitrationCost
            }
          )
          await arbitrableTokenList.executeRequest(ARBITRARY_STRING, {
            from: partyB
          })
          await arbitrableTokenList.requestRegistration(
            ARBITRARY_STRING,
            metaEvidence,
            REQUEST.arbitrationFeesWaitingTime,
            centralizedArbitrator.address,
            {
              from: partyA,
              value: stake + arbitrationCost
            }
          )
        })

        beforeEach('assert pre-conditions', async function() {
          assert.equal(
            (await arbitrableTokenList.items(ARBITRARY_STRING))[0].toNumber(),
            ITEM_STATUS.RESUBMITTED
          )
        })

        it.skip(
          'calling isPermitted should return true ' + blacklist,
          async () => {
            assert.equal(
              await arbitrableTokenList.isPermitted(ARBITRARY_STRING),
              blacklist
            )
          }
        )

        it.skip('calling requestRegistration should revert', async () => {
          await expectThrow(
            arbitrableTokenList.requestRegistration(
              ARBITRARY_STRING,
              metaEvidence,
              REQUEST.arbitrationFeesWaitingTime,
              centralizedArbitrator.address,
              {
                from: arbitrator,
                value: stake + arbitrationCost
              }
            )
          )
        })

        it.skip('calling requestClearing should revert', async function() {
          await expectThrow(
            arbitrableTokenList.requestClearing(
              ARBITRARY_STRING,
              metaEvidence,
              REQUEST.arbitrationFeesWaitingTime,
              centralizedArbitrator.address,
              {
                from: arbitrator,
                value: stake + arbitrationCost
              }
            )
          )
        })

        it.skip('calling challengeBlacklisting should create a dispute', async function() {
          const itemBalance = (await arbitrableTokenList.items(
            ARBITRARY_STRING
          ))[4].toNumber()

          await arbitrableTokenList.challengeRegistration(ARBITRARY_STRING, {
            from: arbitrator,
            value: stake + arbitrationCost
          })

          assert.equal(
            (await arbitrableTokenList.items(ARBITRARY_STRING))[3].toString(),
            arbitrator
          )
          assert.equal(
            (await arbitrableTokenList.items(ARBITRARY_STRING))[4].toNumber(),
            itemBalance + stake
          )
          const disputeID = (await arbitrableTokenList.items(
            ARBITRARY_STRING
          ))[6].toNumber()
          assert.equal(
            (await arbitrableTokenList.items(ARBITRARY_STRING))[5],
            true
          )
          assert.equal(
            web3.toUtf8(await arbitrableTokenList.disputeIDToItem(disputeID)),
            ARBITRARY_STRING
          )
        })

        it.skip('calling challengeClearing should revert', async () => {
          await expectThrow(
            arbitrableTokenList.challengeClearing(ARBITRARY_STRING, {
              from: arbitrator,
              value: stake + arbitrationCost
            })
          )
        })

        it.skip('calling executeRequest should move item into the blacklisted state', async function() {
          await arbitrableTokenList.executeRequest(ARBITRARY_STRING, {
            from: arbitrator
          })

          assert(
            (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[0].toNumber() === ITEM_STATUS.REGISTERED
          )
        })

        describe('executeRuling', async function() {
          let disputeID

          beforeEach('create a dispute', async function() {
            await arbitrableTokenList.challengeRegistration(ARBITRARY_STRING, {
              from: partyB,
              value: stake + arbitrationCost
            })

            disputeID = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[6].toNumber()
          })

          it.skip('calling executeRuling with REGISTER should send item.balance to submitter', async function() {
            const submitter = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[2]
            const submitterBalance = web3.eth.getBalance(submitter)
            const itemBalance = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[4]

            await centralizedArbitrator.giveRuling(disputeID, RULING.REGISTER, {
              from: arbitrator
            })

            const actualBalanceOfSubmitter = web3.eth.getBalance(submitter)
            const expectedBalanceOfSubmitter = submitterBalance
              .plus(itemBalance)
              .minus(new BigNumber(stake).mul(4))
              .minus(new BigNumber(arbitrationFee).mul(3))

            assert(
              actualBalanceOfSubmitter.equals(expectedBalanceOfSubmitter),
              'Difference: ' +
                actualBalanceOfSubmitter
                  .minus(expectedBalanceOfSubmitter)
                  .toNumber()
            )
            assert.equal(
              (await arbitrableTokenList.items(ARBITRARY_STRING))[0].toNumber(),
              ITEM_STATUS.REGISTERED
            )
          })

          it.skip('calling executeRuling with CLEAR should send item.balance to challenger', async function() {
            const challenger = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[3]
            const challengerBalance = web3.eth.getBalance(challenger)
            const itemBalance = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[4]

            await centralizedArbitrator.giveRuling(disputeID, RULING.CLEAR, {
              from: arbitrator
            })

            const actualBalanceOfChallenger = web3.eth.getBalance(challenger)
            const expectedBalanceOfChallenger = itemBalance
              .plus(challengerBalance)
              .minus(new BigNumber(stake).mul(4))
              .minus(new BigNumber(arbitrationFee).mul(3))

            assert(
              actualBalanceOfChallenger.equals(expectedBalanceOfChallenger),
              'Difference: ' +
                actualBalanceOfChallenger
                  .minus(expectedBalanceOfChallenger)
                  .toNumber()
            )

            assert.equal(
              (await arbitrableTokenList.items(ARBITRARY_STRING))[0].toNumber(),
              ITEM_STATUS.CLEARED
            )
          })

          it.skip('calling executeRuling with OTHER should split item.balance between challenger and submitter and move item into the cleared state', async function() {
            const submitter = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[2]
            const challenger = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[3]
            const submitterBalance = web3.eth.getBalance(submitter)
            const challengerBalance = web3.eth.getBalance(challenger)
            const itemBalance = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[4]

            await centralizedArbitrator.giveRuling(disputeID, RULING.OTHER, {
              from: arbitrator
            })

            const actualBalanceOfSubmitter = web3.eth.getBalance(submitter)
            const actualBalanceOfChallenger = web3.eth.getBalance(challenger)
            const expectedBalanceOfSubmitter = itemBalance
              .dividedBy(new BigNumber(2))
              .plus(submitterBalance)
            const expectedBalanceOfChallenger = itemBalance
              .dividedBy(new BigNumber(2))
              .plus(challengerBalance)
              .minus(new BigNumber(stake).mul(2))
              .minus(new BigNumber(arbitrationFee).mul(3).dividedBy(2))

            assert(
              actualBalanceOfSubmitter.equals(expectedBalanceOfSubmitter),
              'Actual: ' +
                actualBalanceOfSubmitter +
                '\t0Expected: ' +
                expectedBalanceOfSubmitter
            )
            assert(
              actualBalanceOfChallenger.equals(expectedBalanceOfChallenger),
              '1Differece: ' +
                actualBalanceOfChallenger.minus(expectedBalanceOfChallenger)
            )

            assert.equal(
              (await arbitrableTokenList.items(ARBITRARY_STRING))[0].toNumber(),
              ITEM_STATUS.CLEARED
            )
          })
        })
      })

      describe('When item in registered state', function() {
        beforeEach('prepare pre-conditions', async function() {
          await arbitrableTokenList.requestRegistration(
            ARBITRARY_STRING,
            metaEvidence,
            REQUEST.arbitrationFeesWaitingTime,
            centralizedArbitrator.address,
            {
              from: arbitrator,
              value: stake + arbitrationCost
            }
          )
          await arbitrableTokenList.executeRequest(ARBITRARY_STRING, {
            from: arbitrator
          })
        })

        beforeEach('assert pre-conditions', async function() {
          assert.equal(
            (await arbitrableTokenList.items(ARBITRARY_STRING))[0],
            ITEM_STATUS.REGISTERED
          )
        })

        it('calling isPermitted should return ' + !blacklist, async () => {
          assert.equal(
            await arbitrableTokenList.isPermitted(ARBITRARY_STRING),
            !blacklist
          )
        })

        it('calling requestRegistration should revert', async () => {
          await expectThrow(
            arbitrableTokenList.requestRegistration(
              ARBITRARY_STRING,
              metaEvidence,
              REQUEST.arbitrationFeesWaitingTime,
              centralizedArbitrator.address,
              {
                from: arbitrator,
                value: stake + arbitrationCost
              }
            )
          )
        })

        it.skip('calling requestClearing should move item into the clearing requested state', async () => {
          await arbitrableTokenList.requestClearing(
            ARBITRARY_STRING,
            metaEvidence,
            REQUEST.arbitrationFeesWaitingTime,
            centralizedArbitrator.address,
            {
              from: arbitrator,
              value: stake + arbitrationCost
            }
          )

          assert.equal(
            (await arbitrableTokenList.items(ARBITRARY_STRING))[0].toNumber(),
            ITEM_STATUS.CLEARING_REQUESTED
          )
        })

        it('calling challengeRegistration should revert', async () => {
          await expectThrow(
            arbitrableTokenList.challengeRegistration(ARBITRARY_STRING, {
              from: arbitrator,
              value: stake + arbitrationCost
            })
          )
        })

        it('calling challengeClearing should revert', async () => {
          await expectThrow(
            arbitrableTokenList.challengeClearing(ARBITRARY_STRING, {
              from: arbitrator,
              value: stake + arbitrationCost
            })
          )
        })

        it('calling executeRequest should revert', async function() {
          await expectThrow(
            arbitrableTokenList.executeRequest(ARBITRARY_STRING, {
              from: arbitrator
            })
          )
        })
      })

      describe('When item in submitted state', function() {
        beforeEach('prepare pre-conditions', async function() {
          await arbitrableTokenList.requestRegistration(
            ARBITRARY_STRING,
            metaEvidence,
            REQUEST.arbitrationFeesWaitingTime,
            centralizedArbitrator.address,
            {
              from: arbitrator,
              value: stake + arbitrationCost
            }
          )
        })

        beforeEach('assert pre-conditions', async function() {
          assert.equal(
            (await arbitrableTokenList.items(ARBITRARY_STRING))[0].toNumber(),
            ITEM_STATUS.SUBMITTED
          )
        })

        it('calling isPermitted should return ' + !blacklist, async () => {
          assert.equal(
            await arbitrableTokenList.isPermitted(ARBITRARY_STRING),
            !blacklist
          )
        })

        it('calling requestRegistration should revert', async () => {
          await expectThrow(
            arbitrableTokenList.requestRegistration(
              ARBITRARY_STRING,
              metaEvidence,
              REQUEST.arbitrationFeesWaitingTime,
              centralizedArbitrator.address,
              {
                from: arbitrator,
                value: stake + arbitrationCost
              }
            )
          )
        })

        it('calling requestClearing should move item into the clearing requested state', async () => {
          await expectThrow(
            arbitrableTokenList.requestClearing(
              ARBITRARY_STRING,
              metaEvidence,
              REQUEST.arbitrationFeesWaitingTime,
              centralizedArbitrator.address,
              {
                from: arbitrator,
                value: stake + arbitrationCost
              }
            )
          )
        })

        it('calling challangeBlacklisting should create a dispute', async function() {
          const itemBalance = (await arbitrableTokenList.items(
            ARBITRARY_STRING
          ))[4].toNumber()

          await arbitrableTokenList.challengeRegistration(ARBITRARY_STRING, {
            from: arbitrator,
            value: stake + arbitrationCost
          })

          const disputeID = (await arbitrableTokenList.items(
            ARBITRARY_STRING
          ))[6].toNumber()

          assert.equal(
            (await arbitrableTokenList.items(ARBITRARY_STRING))[3].toString(),
            arbitrator
          )
          assert.equal(
            (await arbitrableTokenList.items(ARBITRARY_STRING))[4].toNumber(),
            itemBalance + stake
          )
          assert.equal(
            (await arbitrableTokenList.items(ARBITRARY_STRING))[5],
            true
          )
          assert.equal(
            web3.toUtf8(await arbitrableTokenList.disputeIDToItem(disputeID)),
            ARBITRARY_STRING
          )
        })

        it('calling challengeClearing should revert', async () => {
          await expectThrow(
            arbitrableTokenList.challengeClearing(ARBITRARY_STRING, {
              from: arbitrator,
              value: stake + arbitrationCost
            })
          )
        })

        it('calling executeRequest should move item into the blacklisted state', async function() {
          await arbitrableTokenList.executeRequest(ARBITRARY_STRING, {
            from: arbitrator
          })

          assert.equal(
            (await arbitrableTokenList.items(ARBITRARY_STRING))[0].toNumber(),
            ITEM_STATUS.REGISTERED
          )
        })

        describe.skip('executeRuling', async function() {
          let disputeID

          beforeEach('create a dispute', async function() {
            await arbitrableTokenList.challengeRegistration(ARBITRARY_STRING, {
              from: partyB,
              value: stake + arbitrationCost
            })

            disputeID = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[6].toNumber()
          })

          it.skip('calling executeRuling with REGISTER should send item.balance to submitter', async function() {
            const submitter = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[2]
            const submitterBalance = web3.eth.getBalance(submitter)
            const itemBalance = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[4]

            const hash = await centralizedArbitrator.giveRuling(
              disputeID,
              RULING.REGISTER,
              {
                from: arbitrator
              }
            )
            const gasUsed = hash.receipt.gasUsed
            const gasCost = gasUsed * Math.pow(10, 11) // Test environment doesn't care what the gasPrice is, spent value is always gasUsed * 10^11

            const actualBalanceOfSubmitter = web3.eth.getBalance(submitter)
            let expectedBalanceOfSubmitter
            let expectedItemStatus

            if (!rechallengePossible) {
              expectedBalanceOfSubmitter = submitterBalance
                .plus(itemBalance)
                .plus(arbitrationFee)
                .minus(gasCost)
              expectedItemStatus = ITEM_STATUS.REGISTERED
            } else {
              expectedBalanceOfSubmitter = submitterBalance
                .plus(itemBalance)
                .minus(stake)
                .minus(gasCost)
              expectedItemStatus = ITEM_STATUS.SUBMITTED
            }

            assert(
              actualBalanceOfSubmitter.equals(expectedBalanceOfSubmitter),
              'Actual: ' +
                actualBalanceOfSubmitter +
                '\tExpected: ' +
                expectedBalanceOfSubmitter
            )

            assert.equal(
              (await arbitrableTokenList.items(ARBITRARY_STRING))[0].toNumber(),
              expectedItemStatus
            )
          })

          it.skip('calling executeRuling with CLEAR should send item.balance to challenger', async function() {
            const challenger = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[3]
            const challengerBalance = web3.eth.getBalance(challenger)
            const itemBalance = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[4]

            await centralizedArbitrator.giveRuling(disputeID, RULING.CLEAR, {
              from: arbitrator
            })

            const actualBalanceOfChallenger = web3.eth.getBalance(challenger)
            const expectedBalanceOfChallenger = challengerBalance.plus(
              itemBalance
            )

            assert(
              actualBalanceOfChallenger.equals(expectedBalanceOfChallenger),
              'Actual: ' +
                actualBalanceOfChallenger +
                '\tExpected: ' +
                expectedBalanceOfChallenger
            )

            assert.equal(
              (await arbitrableTokenList.items(ARBITRARY_STRING))[0].toNumber(),
              ITEM_STATUS.CLEARED
            )
          })

          it.skip('calling executeRuling with OTHER should split item.balance between challenger and submitter and move item into the absent state', async function() {
            const submitter = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[2]
            const challenger = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[3]
            const submitterBalance = web3.eth.getBalance(submitter)
            const challengerBalance = web3.eth.getBalance(challenger)
            const itemBalance = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[4]
            const disputeID = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[6]

            const hash = await centralizedArbitrator.giveRuling(
              disputeID,
              RULING.OTHER,
              {
                from: arbitrator
              }
            )
            const gasUsed = hash.receipt.gasUsed
            const gasCost = gasUsed * Math.pow(10, 11) // Test environment doesn't care what the gasPrice is, spent value is always gasUsed * 10^11

            const actualBalanceOfSubmitter = web3.eth.getBalance(submitter)
            const actualBalanceOfChallenger = web3.eth.getBalance(challenger)
            const expectedBalanceOfSubmitter = itemBalance
              .dividedBy(new BigNumber(2))
              .plus(submitterBalance)
              .plus(arbitrationFee)
              .minus(gasCost)
            const expectedBalanceOfChallenger = itemBalance
              .dividedBy(new BigNumber(2))
              .plus(challengerBalance)

            assert(
              actualBalanceOfSubmitter.equals(expectedBalanceOfSubmitter),
              'Actual: ' +
                actualBalanceOfSubmitter +
                '\tExpected: ' +
                expectedBalanceOfSubmitter
            )
            assert(
              actualBalanceOfChallenger.equals(expectedBalanceOfChallenger),
              'Actual: ' +
                actualBalanceOfChallenger +
                '\tExpected: ' +
                expectedBalanceOfChallenger
            )
            assert.equal(
              (await arbitrableTokenList.items(ARBITRARY_STRING))[0].toNumber(),
              ITEM_STATUS.ABSENT
            )
          })
        })
      })

      describe.skip('When item in clearing requested state', function() {
        beforeEach('prepare pre-conditions', async function() {
          await arbitrableTokenList.requestRegistration(
            ARBITRARY_STRING,
            metaEvidence,
            REQUEST.arbitrationFeesWaitingTime,
            centralizedArbitrator.address,
            {
              from: partyA,
              value: stake + arbitrationCost
            }
          )
          await arbitrableTokenList.executeRequest(ARBITRARY_STRING, {
            from: partyA
          })
          await arbitrableTokenList.requestClearing(
            ARBITRARY_STRING,
            metaEvidence,
            REQUEST.arbitrationFeesWaitingTime,
            centralizedArbitrator.address,
            {
              from: partyB,
              value: stake + arbitrationCost
            }
          )
        })

        beforeEach('assert pre-conditions', async function() {
          assert.equal(
            (await arbitrableTokenList.items(ARBITRARY_STRING))[0].toNumber(),
            ITEM_STATUS.CLEARING_REQUESTED
          )
        })

        it.skip('calling isPermitted should return ' + !blacklist, async () => {
          assert.equal(
            await arbitrableTokenList.isPermitted(ARBITRARY_STRING),
            !blacklist
          )
        })

        it.skip('calling requestRegistration should revert', async () => {
          await expectThrow(
            arbitrableTokenList.requestRegistration(
              ARBITRARY_STRING,
              metaEvidence,
              REQUEST.arbitrationFeesWaitingTime,
              centralizedArbitrator.address,
              {
                from: partyA,
                value: stake + arbitrationCost
              }
            )
          )
        })

        it.skip('calling requestClearing should revert', async function() {
          await expectThrow(
            arbitrableTokenList.requestClearing(
              ARBITRARY_STRING,
              metaEvidence,
              REQUEST.arbitrationFeesWaitingTime,
              centralizedArbitrator.address,
              {
                from: partyB,
                value: stake + arbitrationCost
              }
            )
          )
        })

        it.skip('calling challengeRegistration should revert', async () => {
          await expectThrow(
            arbitrableTokenList.challengeRegistration(ARBITRARY_STRING, {
              from: partyB,
              value: stake + arbitrationCost
            })
          )
        })

        it.skip('calling challangeClearing should create a dispute', async function() {
          const itemBalance = (await arbitrableTokenList.items(
            ARBITRARY_STRING
          ))[4].toNumber()

          await arbitrableTokenList.challengeClearing(ARBITRARY_STRING, {
            from: partyA,
            value: stake + arbitrationCost
          })
          const disputeID = (await arbitrableTokenList.items(
            ARBITRARY_STRING
          ))[6].toNumber()

          assert.equal(
            (await arbitrableTokenList.items(ARBITRARY_STRING))[3].toString(),
            partyA
          )
          assert.equal(
            (await arbitrableTokenList.items(ARBITRARY_STRING))[4].toNumber(),
            itemBalance + stake
          )
          assert.equal(
            (await arbitrableTokenList.items(ARBITRARY_STRING))[5],
            true
          )
          assert.equal(
            web3.toUtf8(await arbitrableTokenList.disputeIDToItem(disputeID)),
            ARBITRARY_STRING
          )
        })

        it.skip('calling executeRequest should move item into the blacklisted state', async function() {
          await arbitrableTokenList.executeRequest(ARBITRARY_STRING, {
            from: partyA
          })

          assert.equal(
            (await arbitrableTokenList.items(ARBITRARY_STRING))[0].toNumber(),
            ITEM_STATUS.CLEARED
          )
        })

        describe('executeRuling', async function() {
          let disputeID

          beforeEach('create a dispute', async function() {
            await arbitrableTokenList.challengeClearing(ARBITRARY_STRING, {
              from: partyB,
              value: stake + arbitrationCost
            })

            disputeID = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[6].toNumber()
          })

          it.skip('calling executeRuling with REGISTER should send item.balance to challenger', async function() {
            const challenger = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[3]
            const challengerBalance = web3.eth.getBalance(challenger)
            const itemBalance = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[4]

            await centralizedArbitrator.giveRuling(disputeID, RULING.REGISTER, {
              from: arbitrator
            })

            const actualBalanceOfChallenger = web3.eth.getBalance(challenger)
            const expectedBalanceOfChallenger = challengerBalance
              .plus(itemBalance)
              .minus(new BigNumber(stake).mul(3))
              .minus(new BigNumber(arbitrationFee).mul(2))

            assert(
              actualBalanceOfChallenger.equals(expectedBalanceOfChallenger),
              'Difference: ' +
                actualBalanceOfChallenger.minus(expectedBalanceOfChallenger)
            )

            // assert.equal(web3.eth.getBalance(challenger).toNumber(), challengerBalance + itemBalance);
            assert.equal(
              (await arbitrableTokenList.items(ARBITRARY_STRING))[0].toNumber(),
              ITEM_STATUS.REGISTERED
            )
          })

          it.skip('calling executeRuling with CLEAR should send item.balance to submitter', async function() {
            const submitter = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[2]
            const submitterBalance = web3.eth.getBalance(submitter)
            const itemBalance = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[4]

            await centralizedArbitrator.giveRuling(disputeID, RULING.CLEAR, {
              from: arbitrator
            })

            const actualBalanceOfSubmitter = web3.eth.getBalance(submitter)
            const expectedBalanceOfSubmitter = submitterBalance
              .plus(itemBalance)
              .minus(new BigNumber(stake).mul(3))
              .minus(new BigNumber(arbitrationFee).mul(2))

            assert(
              actualBalanceOfSubmitter.equals(expectedBalanceOfSubmitter),
              'Difference: ' +
                actualBalanceOfSubmitter.minus(expectedBalanceOfSubmitter)
            )

            // assert.equal(web3.eth.getBalance(submitter).toNumber(), submitterBalance + itemBalance);
            assert.equal(
              (await arbitrableTokenList.items(ARBITRARY_STRING))[0].toNumber(),
              ITEM_STATUS.CLEARED
            )
          })

          it.skip('calling executeRuling with OTHER should split item.balance between challenger and submitter and move item into the registered state', async function() {
            const submitter = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[2]
            const challenger = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[3]
            const submitterBalance = web3.eth.getBalance(submitter)
            const challengerBalance = web3.eth.getBalance(challenger)
            const itemBalance = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[4]
            const disputeID = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[6]

            await centralizedArbitrator.giveRuling(disputeID, RULING.OTHER, {
              from: arbitrator
            })

            const actualBalanceOfSubmitter = web3.eth.getBalance(submitter)
            const actualBalanceOfChallenger = web3.eth.getBalance(challenger)
            const expectedBalanceOfSubmitter = itemBalance
              .dividedBy(2)
              .plus(submitterBalance)
            const expectedBalanceOfChallenger = itemBalance
              .dividedBy(2)
              .plus(challengerBalance)

            assert(
              actualBalanceOfSubmitter.equals(expectedBalanceOfSubmitter),
              'Difference: ' +
                actualBalanceOfSubmitter.minus(expectedBalanceOfSubmitter)
            )
            assert(
              actualBalanceOfChallenger.equals(expectedBalanceOfChallenger),
              'Difference: ' +
                actualBalanceOfChallenger.minus(expectedBalanceOfChallenger)
            )

            assert.equal(
              (await arbitrableTokenList.items(ARBITRARY_STRING))[0].toNumber(),
              ITEM_STATUS.REGISTERED
            )
          })
        })
      })

      describe('When item in preventive clearing requested state', function() {
        beforeEach('prepare pre-conditions', async function() {
          await arbitrableTokenList.requestClearing(
            ARBITRARY_STRING,
            metaEvidence,
            REQUEST.arbitrationFeesWaitingTime,
            centralizedArbitrator.address,
            {
              from: partyB,
              value: stake + arbitrationCost
            }
          )
        })

        beforeEach('assert pre-conditions', async function() {
          assert.equal(
            (await arbitrableTokenList.items(ARBITRARY_STRING))[0].toNumber(),
            ITEM_STATUS.PREVENTIVE_CLEARING_REQUESTED
          )
        })

        it(
          'calling isPermitted on a not-disputed item should return ' +
            blacklist,
          async () => {
            assert.equal(
              await arbitrableTokenList.isPermitted(ARBITRARY_STRING),
              blacklist
            )
          }
        )

        it(
          'calling isPermitted on a disputed item should return ' + blacklist,
          async () => {
            await arbitrableTokenList.challengeClearing(ARBITRARY_STRING, {
              from: partyA,
              value: stake + arbitrationCost
            }) // To satisfy disputed pre-condition

            assert.equal(
              await arbitrableTokenList.isPermitted(ARBITRARY_STRING),
              !blacklist
            )
          }
        )

        it('calling requestRegistration should revert', async () => {
          await expectThrow(
            arbitrableTokenList.requestRegistration(
              ARBITRARY_STRING,
              metaEvidence,
              REQUEST.arbitrationFeesWaitingTime,
              centralizedArbitrator.address,
              {
                from: partyA,
                value: stake + arbitrationCost
              }
            )
          )
        })

        it('calling requestClearing should revert', async function() {
          await expectThrow(
            arbitrableTokenList.requestClearing(
              ARBITRARY_STRING,
              metaEvidence,
              REQUEST.arbitrationFeesWaitingTime,
              centralizedArbitrator.address,
              {
                from: partyB,
                value: stake + arbitrationCost
              }
            )
          )
        })

        it('calling challengeRegistration should revert', async () => {
          await expectThrow(
            arbitrableTokenList.challengeRegistration(ARBITRARY_STRING, {
              from: partyB,
              value: stake + arbitrationCost
            })
          )
        })

        it('calling challangeClearing should create a dispute', async function() {
          const itemBalance = (await arbitrableTokenList.items(
            ARBITRARY_STRING
          ))[4].toNumber()

          await arbitrableTokenList.challengeClearing(ARBITRARY_STRING, {
            from: partyA,
            value: stake + arbitrationCost
          })

          assert.equal(
            (await arbitrableTokenList.items(ARBITRARY_STRING))[3].toString(),
            partyA
          )
          assert.equal(
            (await arbitrableTokenList.items(ARBITRARY_STRING))[4].toNumber(),
            itemBalance + stake
          )
          const disputeID = (await arbitrableTokenList.items(
            ARBITRARY_STRING
          ))[6].toNumber()
          assert.equal(
            (await arbitrableTokenList.items(ARBITRARY_STRING))[5],
            true
          )
          assert.equal(
            web3.toUtf8(await arbitrableTokenList.disputeIDToItem(disputeID)),
            ARBITRARY_STRING
          )
        })

        it('calling executeRequest should move item into the blacklisted state', async function() {
          await arbitrableTokenList.executeRequest(ARBITRARY_STRING, {
            from: arbitrator
          })

          assert.equal(
            (await arbitrableTokenList.items(ARBITRARY_STRING))[0].toNumber(),
            ITEM_STATUS.CLEARED
          )
        })

        describe.skip('executeRuling', async function() {
          let disputeID

          beforeEach('create a dispute', async function() {
            await arbitrableTokenList.challengeClearing(ARBITRARY_STRING, {
              from: partyB,
              value: stake + arbitrationCost
            })

            disputeID = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[6].toNumber()
          })

          it.skip('calling executeRuling with REGISTER should send item.balance to challenger', async function() {
            const challenger = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[3]
            const challengerBalance = web3.eth.getBalance(challenger)
            const itemBalance = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[4]

            await centralizedArbitrator.giveRuling(disputeID, RULING.REGISTER, {
              from: arbitrator
            })

            const actualBalanceOfChallenger = web3.eth.getBalance(challenger)
            const expectedBalanceOfChallenger = challengerBalance.plus(
              itemBalance
            )

            assert(
              actualBalanceOfChallenger.equals(expectedBalanceOfChallenger)
            )
            assert.equal(
              (await arbitrableTokenList.items(ARBITRARY_STRING))[0].toNumber(),
              ITEM_STATUS.REGISTERED
            )
          })

          it.skip('calling executeRuling with CLEAR should send item.balance to submitter', async function() {
            const submitter = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[2]
            const submitterBalance = web3.eth.getBalance(submitter)
            const itemBalance = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[4]

            await centralizedArbitrator.giveRuling(disputeID, RULING.CLEAR, {
              from: arbitrator
            })

            const actualBalanceOfSubmitter = web3.eth.getBalance(submitter)
            const expectedBalanceOfSubmitter = itemBalance.plus(
              submitterBalance
            )

            assert(actualBalanceOfSubmitter.equals(expectedBalanceOfSubmitter))
            assert.equal(
              (await arbitrableTokenList.items(ARBITRARY_STRING))[0].toNumber(),
              ITEM_STATUS.CLEARED
            )
          })

          it.skip('calling executeRuling with OTHER should split item.balance between challenger and submitter and move item into the absent state', async function() {
            const submitter = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[2]
            const challenger = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[3]
            const submitterBalance = web3.eth.getBalance(submitter)
            const challengerBalance = web3.eth.getBalance(challenger)
            const itemBalance = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[4]
            const disputeID = (await arbitrableTokenList.items(
              ARBITRARY_STRING
            ))[6]

            await centralizedArbitrator.giveRuling(disputeID, RULING.OTHER, {
              from: arbitrator
            })

            const actualBalanceOfSubmitter = web3.eth.getBalance(submitter)
            const actualBalanceOfChallenger = web3.eth.getBalance(challenger)
            const expectedBalanceOfSubmitter = itemBalance
              .dividedBy(2)
              .plus(submitterBalance)
              .plus(new BigNumber(stake))
              .plus(new BigNumber(arbitrationFee).dividedBy(2))
            const expectedBalanceOfChallenger = itemBalance
              .dividedBy(2)
              .plus(challengerBalance)
              .plus(new BigNumber(stake))
              .plus(new BigNumber(arbitrationFee).dividedBy(2))

            assert(
              actualBalanceOfSubmitter.equals(expectedBalanceOfSubmitter),
              'Difference: ' +
                actualBalanceOfSubmitter.minus(expectedBalanceOfSubmitter)
            )
            assert(
              actualBalanceOfChallenger.equals(expectedBalanceOfChallenger),
              'Difference: ' +
                actualBalanceOfChallenger.minus(expectedBalanceOfChallenger)
            )

            assert.equal(
              (await arbitrableTokenList.items(ARBITRARY_STRING))[0].toNumber(),
              ITEM_STATUS.ABSENT
            )
          })
        })
      })
    }
  )
})
