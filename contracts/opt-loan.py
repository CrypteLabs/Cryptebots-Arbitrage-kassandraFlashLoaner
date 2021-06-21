import sys
import numpy as np
import sympy as sp
from sympy import symbols, solve

x = symbols('x')

### Values passed from the .js file are accessed with sys.argv[i]
### float(sys.argv[i]), for i in [1,7], to get a float variable

###             | = pool balances, first Balancer, first ETH, for i in [1,4]
### sys.argv[i] | = Balancer token weight, first ETH, for i in [5,6]
###             | = Balancer swap fee, for i=7

B0BalEth = float(sys.argv[1])
B0BalUsdc = float(sys.argv[2])
B0UniEth = float(sys.argv[3])
B0UniUsdc = float(sys.argv[4])
WEth = float(sys.argv[5])
WUsdc = float(sys.argv[6])
balSwapFee = float(sys.argv[7])
uniSwapFee = 0.003
expr = ((1-balSwapFee)*(( B0UniEth - (B0UniEth * B0UniUsdc) / (B0UniUsdc + ( (1 - uniSwapFee) * x)) ) * ( ( (1 - uniSwapFee) * x) - (WEth / WUsdc) * (B0BalUsdc - B0BalUsdc * np.power(B0BalEth / (B0BalEth + B0UniEth - (B0UniEth*B0UniUsdc)/(B0UniUsdc + ( (1 - uniSwapFee) * x))) , (WEth/WUsdc))) ))) + ((1 - balSwapFee) * ((B0UniEth - (B0UniEth * B0UniUsdc) / (B0UniUsdc + ( (1 - uniSwapFee) * x))) * (B0UniUsdc + (WEth / WUsdc) * B0BalUsdc))) + (( (1 - uniSwapFee) * x) * B0BalEth) + ((1 - np.power(B0BalEth / (B0BalEth + B0UniEth - (B0UniEth * B0UniUsdc) / (B0UniUsdc + ( (1 - uniSwapFee) * x))),WEth / WUsdc)) * (WEth / WUsdc) * B0BalUsdc * B0UniEth) - ((WEth / WUsdc) * B0UniEth * B0BalUsdc) + (B0BalEth * B0UniUsdc)

sol = solve(expr)

opttrade = 0.
### We don't want negative or imaginary solutions, since the solution is the amount of token being traded
for i in range(len(sol)):
    if sp.re(sol[i]) > 0 and sp.im(sol[i]) < 1e-8:
        opttrade = sp.re(sol[i])

print(opttrade+float(sys.argv[1])+float(sys.argv[2]))
