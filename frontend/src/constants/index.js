// Remyra Contract ABIs and Addresses
// These are populated after deployment

export const NETWORKS = {
    polkadotHub: {
        chainId: '0xD0A',
        chainName: 'Polkadot Hub',
        rpcUrls: ['https://polkadot-asset-hub-eth-rpc.polkadot.io'],
        nativeCurrency: { name: 'DOT', symbol: 'DOT', decimals: 18 },
        blockExplorerUrls: ['https://assethub-polkadot.subscan.io'],
    },
    westend: {
        chainId: '0x190F2A65',
        chainName: 'Westend Asset Hub',
        rpcUrls: ['https://westend-asset-hub-eth-rpc.polkadot.io'],
        nativeCurrency: { name: 'WND', symbol: 'WND', decimals: 18 },
        blockExplorerUrls: ['https://assethub-westend.subscan.io'],
    },
    localhost: {
        chainId: '0x7A69',
        chainName: 'Localhost',
        rpcUrls: ['http://127.0.0.1:8545'],
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    },
};

export const DEFAULT_NETWORK = 'localhost';

// Contract addresses - update after deployment
export const CONTRACTS = {
    Remyra: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
    FXOracle: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
    MockUSDT: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    MockUSDC: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
};

// Supported tokens
export const TOKENS = [
    { symbol: 'USDT', name: 'Tether USD', decimals: 6, icon: '$' },
    { symbol: 'USDC', name: 'USD Coin', decimals: 6, icon: '¢' },
];

// Destination chains (parachains)
export const DEST_CHAINS = [
    { id: 0, name: 'Polkadot Hub (Same Chain)', icon: '●' },
    { id: 2004, name: 'Moonbeam', icon: '◐' },
    { id: 2006, name: 'Astar', icon: '★' },
    { id: 2034, name: 'Hydration', icon: '◇' },
    { id: 2030, name: 'Bifrost', icon: '⟐' },
];

// Remittance corridors for FX display
export const CORRIDORS = [
    { from: 'USD', to: 'INR', country: 'IN — India', rate: 83.50 },
    { from: 'USD', to: 'PHP', country: 'PH — Philippines', rate: 56.20 },
    { from: 'USD', to: 'MXN', country: 'MX — Mexico', rate: 17.15 },
    { from: 'USD', to: 'NGN', country: 'NG — Nigeria', rate: 1550.00 },
    { from: 'USD', to: 'BRL', country: 'BR — Brazil', rate: 4.97 },
    { from: 'USD', to: 'GBP', country: 'GB — UK', rate: 0.79 },
    { from: 'USD', to: 'EUR', country: 'EU — Europe', rate: 0.92 },
    { from: 'USD', to: 'KES', country: 'KE — Kenya', rate: 129.50 },
];

// Fee comparison data (for the "wow" dashboard)
export const FEE_COMPARISON = [
    {
        provider: 'Western Union',
        fee: 53,
        feePercent: 5.3,
        speed: '3-5 days',
        color: '#FFB020',
        logo: '▨',
    },
    {
        provider: 'MoneyGram',
        fee: 38,
        feePercent: 3.8,
        speed: '2-3 days',
        color: '#FF6B35',
        logo: '▤',
    },
    {
        provider: 'Wise',
        fee: 12,
        feePercent: 1.2,
        speed: '1-2 days',
        color: '#9FE870',
        logo: '≋',
    },
    {
        provider: 'Remyra',
        fee: 3,
        feePercent: 0.3,
        speed: 'Instant',
        color: '#1a1a2e',
        logo: '↯',
        isUs: true,
    },
];

// Simplified ABIs for frontend interaction
export const REMYRA_ABI = [
    'function sendRemittance(address tokenIn, uint256 amount, address recipient, string destCurrency) returns (uint256)',
    'function sendCrossChainRemittance(address tokenIn, uint256 amount, address recipient, uint32 destChainId, string destCurrency) returns (uint256)',
    'function estimateRemittance(address tokenIn, uint256 amount, string destCurrency) view returns (uint256 amountOut, uint256 fee)',
    'function getRemittance(uint256 id) view returns (tuple(uint256 id, address sender, address recipient, address tokenIn, uint256 amountIn, uint256 amountOut, uint256 fee, uint32 destChainId, string destCurrency, uint256 timestamp, uint8 status))',
    'function getUserRemittances(address user) view returns (uint256[])',
    'function getStats() view returns (uint256 volume, uint256 fees, uint256 remittanceCount, uint256 supportedTokenCount)',
    'function getSupportedTokens() view returns (address[])',
    'event RemittanceSent(uint256 indexed id, address indexed sender, address indexed recipient, address tokenIn, uint256 amountIn, uint256 amountOut, uint256 fee, uint32 destChainId)',
];

export const ERC20_ABI = [
    'function approve(address spender, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)',
    'function faucet()',
];

export const FX_ORACLE_ABI = [
    'function getRate(string from, string to) view returns (uint256 rate, uint256 updatedAt)',
    'function convert(string from, string to, uint256 amountIn) view returns (uint256 amountOut, uint256 fee)',
    'function calculateFee(uint256 amount) view returns (uint256 fee, uint256 feeBps)',
    'function baseFee() view returns (uint256)',
];
