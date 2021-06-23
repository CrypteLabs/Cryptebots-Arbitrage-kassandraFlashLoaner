pragma solidity >=0.6.6;

import './UniswapV2Library.sol';
import './interfaces/IUniswapV2Router02.sol';
import './interfaces/IUniswapV2Pair.sol';
import './interfaces/IERC20.sol';
import './interfaces/IBPool.sol';
/* need to import BMath from Balancer to use some functions, how is it done? */
// when adding the contract to mainnet how this contract access the other contract functions like BPool.sol, BMath.sol

contract FlashLoaner {
  address immutable uniFactory;
  address immutable balPool;
  uint constant deadline = 10 days; // used in swapExactTokensForTokens(), it sets a timepstamp after which the transaction will revert   
  IUniswapV2Router02 immutable uniRouter;

  constructor(address _uniFactory, address _uniRouter, address _balPool) public {
    uniFactory = _uniFactory;  
    uniRouter = IUniswapV2Router02(_uniRouter);
    balPool = _balPool;
  }

  function uniswapV2Call(address _sender, uint _amount0, uint _amount1, bytes calldata _data) external {
      address[] memory path = new address[](2);
      uint amountToken = _amount0 == 0 ? _amount1 : _amount0;
      
      address token0 = IUniswapV2Pair(msg.sender).token0(); // are theses adrresses the same for calling BPool.getBalance()?
      address token1 = IUniswapV2Pair(msg.sender).token1();

      require(msg.sender == UniswapV2Library.pairFor(uniFactory, token0, token1), "Unauthorized by UniSwap"); 
      require(_amount0 == 0 || _amount1 == 0);

      path[0] = _amount0 == 0 ? token1 : token0;
      path[1] = _amount0 == 0 ? token0 : token1;

      IERC20 token = IERC20(_amount0 == 0 ? token1 : token0);
      IERC20 tokenBal = IERC20(_amount0 == 0 ? token0 : token1); // token exchanged at Balancer
      
      token.approve(address(uniRouter), amountToken);

      // no need for require() check, if amount required is not sent uniRouter will revert
      uint amountRequiredUni = UniswapV2Library.getAmountsIn(uniFactory, amountToken, path)[0];
      uint amountReceivedUni = uniRouter.swapExactTokensForTokens(amountToken, amountRequiredUni, path, msg.sender, deadline)[1]; //uniSwap swap
      
      /* balPool is not the contract here, we must import from BMath.sol */
      uint minAmountOut = balPool.calcOutGivenIn(balPool.getBalance(path[1]), balPool.getNormalizedWeight(path[1]), balPool.getBalance(path[0]), balPool.getNormalizedWeight(path[0]), amountReceivedUni, balPool.getSwapFee());
      uint maxPrice = amountReceivedUni / minAmountOut;

      // check if the Balancer swap on the pool is allowed
      if (tokenBal.allowance(address(this), balPool) < amountReceivedUni) {
        tokenBal.approve(balPool, amountReceivedUni);
      }

      uint amountReceivedBal = balPool.swapExactAmountIn(path[1], amountReceivedUni, path[0], minAmountOut, maxPrice)[0];

      // YEAHH PROFIT
      token.transfer(_sender, amountReceivedBal - amountRequiredUni);
    
  }
}