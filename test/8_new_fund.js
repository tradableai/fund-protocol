const path = require('path');
const Promise = require('bluebird');

const NewFund = artifacts.require('./NewFund.sol');
const FundStorage = artifacts.require('./FundStorage.sol');
const DataFeed = artifacts.require('./DataFeed.sol');
const NewInvestorActions = artifacts.require('./NewInvestorActions.sol');

const scriptName = path.basename(__filename);

if (typeof web3.eth.getAccountsPromise === 'undefined') {
  Promise.promisifyAll(web3.eth, { suffix: 'Promise' });
}

web3.eth.getTransactionReceiptMined = require('../utils/getTransactionReceiptMined.js');

const {
  ethToWei, getInvestorData, getContractNumericalData, getBalancePromise,
} = require('../utils');

// DEPLOY PARAMETERS
const {
  USD_ETH_EXCHANGE_RATE,
  MIN_INITIAL_SUBSCRIPTION_USD,
  MIN_SUBSCRIPTION_USD,
  MIN_REDEMPTION_SHARES,
  ADMIN_FEE,
  MGMT_FEE,
  PERFORM_FEE,
} = require('../config');

contract('New Fund', (accounts) => {
  accounts.pop(); // Remove Oraclize account
  const MANAGER = accounts[0];
  const EXCHANGE = accounts[1];
  const FUND = accounts[2];
  const FUND2 = accounts[3];
  const NOTAUTHORIZED = accounts[4];
  const investors = accounts.slice(5);
  const INVESTOR1 = investors[0];
  const INVESTOR2 = investors[1];
  const INVESTOR3 = investors[2];
  const INVESTOR4 = investors[3];

  const ethInvestors = investors.slice(5, 10);
  const usdInvestors = investors.slice(11, 16);

  const ETH_INVESTOR1 = ethInvestors[0];
  const USD_INVESTOR1 = usdInvestors[0];

  const WEI_MIN_INITIAL = ethToWei((MIN_INITIAL_SUBSCRIPTION_USD) / USD_ETH_EXCHANGE_RATE);
  const WEI_BELOW_MIN_INITIAL = ethToWei((MIN_INITIAL_SUBSCRIPTION_USD - 1) / USD_ETH_EXCHANGE_RATE);
  const WEI_MIN_SUB = ethToWei((MIN_INITIAL_SUBSCRIPTION_USD) / USD_ETH_EXCHANGE_RATE);
  const WEI_BELOW_MIN_SUB = ethToWei((MIN_INITIAL_SUBSCRIPTION_USD - 1) / USD_ETH_EXCHANGE_RATE);

  // Contract instances
  let newFund;
  let fundStorage;
  let dataFeed;
  let investorActions;

  // Temp variables
  let fundBalance;

  const fundStorageFields = [
    'decimals',
    'minInitialSubscriptionUsd',
    'minSubscriptionUsd',
    'minRedemptionShares',
  ];

  const dataFeedFields = [
    'value',
    'usdEth',
    'usdBtc',
    'usdLtc',
    'timestamp',
  ];

  before('before: should prepare', () => {
    console.log(`  ****** START TEST [ ${scriptName} ] *******`);
    return Promise.all([
      NewFund.deployed(),
      FundStorage.deployed(),
      DataFeed.deployed(),
      NewInvestorActions.deployed(),
    ])
      .then(_instances => [newFund, fundStorage, dataFeed, investorActions] = _instances)
      .catch(err => assert.throw(`failed to get instances: ${err.toString()}`))
      .then(() => fundStorage.setFund(newFund.address, { from: MANAGER }))
      .catch(err => assert.throw(`failed - fundStorage.setFund(): ${err.toString()}`))
      .then(() => investorActions.setFund(newFund.address, { from: MANAGER }))
      .catch(err => assert.throw(`failed - investorActions.setFund(): ${err.toString()}`))
      .then(() => fundStorage.queryContainsInvestor(INVESTOR1))
      .then(contains => assert.strictEqual(Number(contains), 0, 'investor already whitelisted'))
      .catch(err => assert.throw(`failed queryContainsInvestor: ${err.toString()}`))
      .then(() => Promise.all([
        newFund.manager.call(),
        newFund.exchange.call(),
        newFund.navCalculator.call(),
        newFund.investorActions.call(),
        newFund.fundStorage.call(),
      ]))
      .then(_addresses => _addresses.forEach(_address => assert.notEqual(_address, '0x0000000000000000000000000000000000000000', 'Contract address not set')))
      .catch(err => `  Error retrieving variables: ${err.toString()}`)
      .then(() => {
        getContractNumericalData('FundStorage Fields Data', fundStorage, fundStorageFields);
        getContractNumericalData('DataFeed Fields Data', dataFeed, dataFeedFields);
      })
      .catch(err => assert.throw(`failed to get contracts data: ${err.toString()}`));
  });

  describe('getFundDetails()', () => {
    let newFundDetails;
    let fundStorageDetails;

    it('can get fund details', () => newFund.getFundDetails()
      .then(_details => newFundDetails = _details)
      .catch(err => `Error calling newFund getFundDetails(): ${err.toString()}`)
      .then(() => Promise.all([
        fundStorage.name(),
        fundStorage.symbol(),
        fundStorage.minInitialSubscriptionUsd(),
        fundStorage.minSubscriptionUsd(),
        fundStorage.minRedemptionShares(),
      ]))
      .then(_details => fundStorageDetails = _details)
      .then(() => newFundDetails.forEach((_detail, index) => {
        if (typeof _detail === 'string') {
          assert.strictEqual(_detail, fundStorageDetails[index], 'string details do not match');
        } else {
          assert.strictEqual(Number(_detail), Number(fundStorageDetails[index]), 'number details do not match');
        }
      })));
  });  // describe

  describe('whiteListInvestor', () => {
    it('should have a whiteListInvestor function', () => assert.isDefined(newFund.whiteListInvestor, 'function undefined'));

    ethInvestors.forEach((_investor, index) => {
      it(`should whitelist an ETH investor [${index}] ${_investor}`, () => getInvestorData(fundStorage, _investor)
        .then(_investorData => assert.strictEqual(_investorData.investorType, 0, 'investor type not initialized'))
        .catch(err => assert.throw(`Error getting investor 1: ${err.toString()}`))
        .then(() => newFund.whiteListInvestor(_investor, 1, 0, { from: MANAGER }))
        .catch(err => assert.throw(`Error whitelisting investor ${_investor}: ${err.toString()}`))
        .then(() => getInvestorData(fundStorage, _investor))
        .then(_investorData => assert.strictEqual(_investorData.investorType, 1, 'incorrect investor type'))
        .catch(err => assert.throw(`Error getting investor 2: ${err.toString()}`)));
    });

    usdInvestors.forEach((_investor, index) => {
      it(`should whitelist an USD investor [${index}] ${_investor}`, () => getInvestorData(fundStorage, _investor)
        .then(_investorData => assert.strictEqual(_investorData.investorType, 0, 'investor type not initialized'))
        .catch(err => assert.throw(`Error getting investor 1: ${err.toString()}`))
        .then(() => newFund.whiteListInvestor(_investor, 2, 0, { from: MANAGER }))
        .catch(err => assert.throw(`Error whitelisting investor ${_investor}: ${err.toString()}`))
        .then(() => getInvestorData(fundStorage, _investor))
        .then(_investorData => assert.strictEqual(_investorData.investorType, 2, 'incorrect investor type'))
        .catch(err => assert.throw(`Error getting investor 2: ${err.toString()}`)));
    });
  }); // describe

  describe('requestEthSubscription', () => {
    it('not allow ETH subscription request below minimumInitialSubscriptionUsd', () => getInvestorData(fundStorage, ETH_INVESTOR1)
      .then(_investorData => assert.strictEqual(Number(_investorData.investorType), 1, 'incorrect investor type'))
      .catch(err => assert.throw(`Error getting investor data: ${err.toString()}`))
      .then(() => newFund.requestEthSubscription({ from: ETH_INVESTOR1, value: WEI_BELOW_MIN_INITIAL }))
      .then(
        () => assert.throw('should not have reached here'),
        e => assert.isAtLeast(e.message.indexOf('revert'), 0)
      )
    ); // it

    it('accept valid requestEthSubscription request', () => getBalancePromise(newFund.address)
      .then(_bal => fundBalance = Number(_bal))
      .then(() => newFund.requestEthSubscription({ from: ETH_INVESTOR1, value: WEI_MIN_INITIAL }))
      .then(() => getInvestorData(fundStorage, ETH_INVESTOR1))
      .catch(err => assert.throw(`Error requesting Eth subscription: ${err.toString()}`))
      .then(_investorData => assert.strictEqual(Number(_investorData.amountPendingSubscription), Number(WEI_MIN_INITIAL), 'incorrect amountPendingSubscription amount'))
      .catch(err => assert.throw(`Error getting investor data: ${err.toString()}`))
      .then(() => getBalancePromise(newFund.address))
      .then(_bal => assert.strictEqual(Number(_bal), fundBalance + Number(WEI_MIN_INITIAL), 'incorrect fund balance increase'))
    );

    it('not allow USD subscription below minimumInitialSubscriptionUsd', () => {

    });

    it('subscribe USD investor', () => {

    });

    it('not allow repeat ETH subscription below minimumSubscriptionUsd', () => {

    });
    
    it('subscribe repeat ETH investor', () => {
      
    });

    it('not allow repeat USD subscription below minimumSubscriptionUsd', () => {

    });

    it('subscribe repeat USD investor', () => {

    });

  }); // describe requestEthSubscription

  xdescribe('subscribeInvestors', () => {
    it('not allow ETH subscription below minimumInitialSubscriptionUsd', () => {

    });
    
    it('subscribe ETH investor', () => {
      
    });

    it('not allow USD subscription below minimumInitialSubscriptionUsd', () => {

    });

    it('subscribe USD investor', () => {

    });

    it('not allow repeat ETH subscription below minimumSubscriptionUsd', () => {

    });
    
    it('subscribe repeat ETH investor', () => {
      
    });

    it('not allow repeat USD subscription below minimumSubscriptionUsd', () => {

    });

    it('subscribe repeat USD investor', () => {

    });
  }); // describe subscribeInvestors

  xdescribe('changeModule', () => {
    it('NavCalculator', () => {

    });

    it('InvestorActions', () => {

    });

    it('DataFeed', () => {

    });

    it('FundStroage', () => {

    });
  }); // describe changeModule
}); // contract
