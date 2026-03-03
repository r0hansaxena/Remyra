import { useState, useEffect, useCallback } from 'react';
import { BrowserProvider, JsonRpcSigner } from 'ethers';
import { NETWORKS } from '../constants';

// Add type for window.ethereum
declare global {
    interface Window {
        ethereum?: any;
    }
}

export interface WalletState {
    account: string | null;
    shortAddress: string;
    provider: BrowserProvider | null;
    signer: JsonRpcSigner | null;
    chainId: number | null;
    isConnecting: boolean;
    error: string | null;
    connectWallet: () => Promise<void>;
    disconnectWallet: () => void;
    switchNetwork: (networkKey: string) => Promise<void>;
    isConnected: boolean;
}

export function useWallet(): WalletState {
    const [account, setAccount] = useState<string | null>(null);
    const [provider, setProvider] = useState<BrowserProvider | null>(null);
    const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
    const [chainId, setChainId] = useState<number | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const connectWallet = useCallback(async () => {
        if (typeof window === 'undefined' || !window.ethereum) {
            setError('MetaMask not detected. Please install MetaMask.');
            return;
        }

        setIsConnecting(true);
        setError(null);

        try {
            const browserProvider = new BrowserProvider(window.ethereum);
            const accounts = await browserProvider.send('eth_requestAccounts', []);
            const network = await browserProvider.getNetwork();
            const walletSigner = await browserProvider.getSigner();

            setProvider(browserProvider);
            setSigner(walletSigner);
            setAccount(accounts[0]);
            setChainId(Number(network.chainId));
        } catch (err: any) {
            setError(err.message || 'Failed to connect wallet');
        } finally {
            setIsConnecting(false);
        }
    }, []);

    const disconnectWallet = useCallback(() => {
        setAccount(null);
        setProvider(null);
        setSigner(null);
        setChainId(null);
    }, []);

    const switchNetwork = useCallback(async (networkKey: string) => {
        if (typeof window === 'undefined' || !window.ethereum) return;

        const network = NETWORKS[networkKey];
        if (!network) return;

        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: network.chainId }],
            });
        } catch (switchError: any) {
            if (switchError.code === 4902) {
                await window.ethereum.request({
                    method: 'wallet_addEthereumChain',
                    params: [{
                        chainId: network.chainId,
                        chainName: network.chainName,
                        rpcUrls: network.rpcUrls,
                        nativeCurrency: network.nativeCurrency,
                        blockExplorerUrls: network.blockExplorerUrls || [],
                    }],
                });
            }
        }
    }, []);

    // Listen for account and chain changes
    useEffect(() => {
        if (typeof window === 'undefined' || !window.ethereum) return;

        const handleAccountsChanged = (accounts: string[]) => {
            if (accounts.length === 0) {
                disconnectWallet();
            } else {
                setAccount(accounts[0]);
            }
        };

        const handleChainChanged = (chainIdHex: string) => {
            setChainId(Number(chainIdHex));
            window.location.reload();
        };

        window.ethereum.on('accountsChanged', handleAccountsChanged);
        window.ethereum.on('chainChanged', handleChainChanged);

        return () => {
            window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
            window.ethereum.removeListener('chainChanged', handleChainChanged);
        };
    }, [disconnectWallet]);

    const shortAddress = account
        ? `${account.slice(0, 6)}...${account.slice(-4)}`
        : '';

    return {
        account,
        shortAddress,
        provider,
        signer,
        chainId,
        isConnecting,
        error,
        connectWallet,
        disconnectWallet,
        switchNetwork,
        isConnected: !!account,
    };
}
