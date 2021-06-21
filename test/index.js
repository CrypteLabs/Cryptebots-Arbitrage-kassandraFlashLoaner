// make sure to test your own strategies, do not use this version in production
//require('dotenv').config();

const privateKey = process.env.PRIVATE_KEY;
// your contract address
const flashLoanerAddress = process.env.FLASH_LOANER;

const { ethers } = require('ethers');

// uni/sushiswap ABIs
const UniswapV2Pair = require('./abis/IUniswapV2Pair.json');
const UniswapV2Factory = require('./abis/IUniswapV2Factory.json');
const BalancerPair = require('./abis/');
const BalancerFactory = require('./abis/');

// use your own Infura node in production
const provider = new ethers.providers.InfuraProvider('mainnet', process.env.INFURA_KEY);

const wallet = new ethers.Wallet(privateKey, provider);

// amount of tokens traded, will be determined optimally in order to cover all the arbitrage window
var token0_Trade;
var token1_Trade;

const runBot = async () => {
  const balancerFactory = new ethers.Contract(
    '0xe5d1fab0c5596ef846dcc0958d6d0b20e1ec4498', /* balancer pool of equal weights 33.33...% between WETH, MKR, DAI*/
    BalancerFactory.abi, wallet,
  );
  const uniswapFactory = new ethers.Contract(
    '0x9424b1412450d0f8fc2255faf6046b98213b76bd',
    UniswapV2Factory.abi, wallet,
  );
  const token0Address = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'; //WETH
  const token1Address = '0x6b175474e89094c44da98b954eedeac495271d0f'; //DAI
  //const mkrAddress = '0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2';

  let uniswapEthDai;
  let balancerEthDai;
  
  const loadPairs = async () => {
    balancerToken0Token1 = new ethers.Contract(
      await balancerFactory.getPair(token0Address, token1Address),
      BalancerPair.abi, wallet,
    );
    uniswapToken0Token1 = new ethers.Contract(
      await uniswapFactory.getPair(token0Address, token1Address),
      UniswapV2Pair.abi, wallet,
    );
  };

  await loadPairs();

  

  provider.on('block', async (blockNumber) => {
    try {
      console.log(blockNumber);

      /* check if that's how we use BPool.sol functions, with the balancerFactory in front of the function */
      const balancerSwapFee = balancerToken0Token1.getSwapFee(); /* Balancer has swap fees between 1e^-4% and 10%, for this specific pool it is 0.2% */

      const balancerReserves = await balancerEthDai.getReserves();
      const uniswapReserves = await uniswapEthDai.getReserves();

      const reserve0Balancer = Number(ethers.utils.formatUnits(balancerReserves[0], 18));
      const reserve1Balancer = Number(ethers.utils.formatUnits(balancerReserves[1], 18));
      const weight0Balancer = balancerFactory.getNormalizedWeight(token0Address);
      const weight1Balancer = balancerFactory.getNormalizedWeight(token1Address);

      const reserve0Uni = Number(ethers.utils.formatUnits(uniswapReserves[0], 18));
      const reserve1Uni = Number(ethers.utils.formatUnits(uniswapReserves[1], 18));

      const priceUniswap = reserve0Uni / reserve1Uni;
      const priceBalancer = (reserve0Balancer / weight0Balancer) / (reserve1Balancer / weight1Balancer);

      var optTrade;

      const shouldStartToken0 = priceUniswap < priceBalancer;

      // calculating values of optimal trade
      const spawn = require('child_process').spawn;
      const process = spawn('python', ['./opt-loan.py', reserve0Balancer, reserve1Balancer, reserve0Uni, reserve1Uni, weight0Balancer, weight1Balancer]);
      process.stdout.on('data', data => {
        console.log(data);
        optTrade = float(data);
      });
      /* here we can call another optimal trade calculation adjusting the weights before trading */

      const outFirstTrade = (shouldStartToken0 
        ? uniswapReserves[1] - ( uniswapReserves[0] * uniswapReserves[1] ) / (uniswapReserves[0] + optTrade)
        : uniswapReserves[0] - (uniswapReserves[0] * uniswapReserves[1]) / (uniswapReserves[1] + optTrade) 
        );

      // the first token in the variable is the token sold, the second bought 
      const finalSelfBalance = calcOutGivenIn(
        shouldStartToken0 ? reserve1Balancer : reserve0Balancer,
        shouldStartToken0 ? weight1Balancer : weight0Balancer,
        shouldStartToken0 ? reserve0Balancer : reserve1Balancer,
        shouldStartToken0 ? weight0Balancer : weight1Balancer,
        optTrade,
        balancerSwapFee
      );
      const spread = (finalSelfBalance - optTrade) / optTrade;
      // trades always begin in the same AMM pool, UniSwap, we determine only if ETH/DAI will be bought first, based on ETH price
      const shouldTrade = (optTrade != 0.); /* opt-loan.py returns, if it exists, the ammount of trade whose 
                                               spread covers the slippages and swap fees, and optimally using
                                               the arbitrage window. */



      console.log(`UNISWAP PRICE ${priceUniswap}`);
      console.log(`BALANCER PRICE ${priceBalancer}`);
      console.log(`PROFITABLE? ${shouldTrade}`);
      console.log(`CURRENT SPREAD: ${(priceBalancer / priceUniswap - 1) * 100}%`);
      console.log(`ABSLUTE SPREAD: ${spread}`);

      if (!shouldTrade) return;

      const gasLimit = await balancerEthDai.estimateGas.swap( /* estimateGas comes from js */
        !shouldStartToken0 ? token1_Trade : 0,
        shouldStartToken0 ? token0_Trade : 0,
        flashLoanerAddress,
        ethers.utils.toUtf8Bytes('1'),
      );

      const gasPrice = await wallet.getGasPrice();

      const gasCost = Number(ethers.utils.formatEther(gasPrice.mul(gasLimit)));

      const shouldSendTx = shouldStartToken0
        ? (gasCost / token0_Trade) < spread
        : (gasCost / (token1_Trade * priceUniswap)) < spread; /* added slippage */

      // don't trade if gasCost is higher than the spread
      if (!shouldSendTx) return;

      const options = {
        gasPrice,
        gasLimit,
      };
      const tx = await uniswapToken0Token1.swap( /* https://github.com/balancer-labs/balancer-core/blob/master/contracts/BPool.sol#L423 */
        shouldStartToken0 ? optTrade : 0, 
        shouldStartToken0 ? 0 : optTrade,
        flashLoanerAddress,
        ethers.utils.toUtf8Bytes('1'), options, /* https://uniswap.org/docs/v2/smart-contract-integration/using-flash-swaps/ */
      );

      console.log('ARBITRAGE EXECUTED! PENDING TX TO BE MINED');
      console.log(tx);

      await tx.wait();

      console.log('SUCCESS! TX MINED');
    } catch (err) {
      console.error(err);
    }
  });
};

console.log('Bot started!');

runBot();
