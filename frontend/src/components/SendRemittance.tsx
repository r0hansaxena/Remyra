"use client";

import { useState, useEffect, useCallback } from 'react';
import { Contract, parseUnits, formatUnits } from 'ethers';
import {
    TOKENS, DEST_CHAINS, CORRIDORS, CONTRACTS,
    REMYRA_ABI, ERC20_ABI, FX_ORACLE_ABI,
} from '../constants';
import { WalletState } from '../hooks/useWallet';
import styles from './SendRemittance.module.css';

interface SendRemittanceProps {
    wallet: WalletState;
}

interface TxResult {
    id: string;
    amount: string;
    token: string;
    recipient: string;
    destCurrency: string;
    fee: string;
    convertedAmount: string;
    status: string;
    timestamp: string;
    txHash: string;
}

type TxStep = 'idle' | 'approving' | 'sending' | 'confirmed' | 'error';

export default function SendRemittance({ wallet }: SendRemittanceProps) {
    const [token, setToken] = useState('USDT');
    const [amount, setAmount] = useState('');
    const [recipient, setRecipient] = useState('');
    const [destChain, setDestChain] = useState(0);
    const [corridor, setCorridor] = useState('INR');

    const [txStep, setTxStep] = useState<TxStep>('idle');
    const [txResult, setTxResult] = useState<TxResult | null>(null);
    const [errorMsg, setErrorMsg] = useState('');

    const [balance, setBalance] = useState<string | null>(null);
    const [faucetLoading, setFaucetLoading] = useState(false);

    // --- Derived values (client-side fallback) ---
    const selectedCorridor = CORRIDORS.find(c => c.to === corridor) || CORRIDORS[0];
    const fee = amount ? (parseFloat(amount) * 0.003).toFixed(2) : '0.00';
    const amountAfterFee = amount ? (parseFloat(amount) - parseFloat(fee)).toFixed(2) : '0.00';
    const convertedAmount = amount ? (parseFloat(amountAfterFee) * selectedCorridor.rate).toFixed(2) : '0.00';

    const traditionalFee = amount ? (parseFloat(amount) * 0.053).toFixed(2) : '0.00';
    const savings = amount ? (parseFloat(traditionalFee) - parseFloat(fee)).toFixed(2) : '0.00';

    // --- Get token contract address ---
    const getTokenAddress = useCallback(() => {
        return token === 'USDT' ? CONTRACTS.MockUSDT : CONTRACTS.MockUSDC;
    }, [token]);

    // --- Fetch balance ---
    const fetchBalance = useCallback(async () => {
        if (!wallet.signer || !wallet.account) {
            setBalance(null);
            return;
        }
        try {
            const tokenContract = new Contract(getTokenAddress(), ERC20_ABI, wallet.signer);
            const bal = await tokenContract.balanceOf(wallet.account);
            const decimals = await tokenContract.decimals();
            setBalance(formatUnits(bal, decimals));
        } catch {
            setBalance(null);
        }
    }, [wallet.signer, wallet.account, getTokenAddress]);

    useEffect(() => {
        fetchBalance();
    }, [fetchBalance, token]);

    // --- Faucet ---
    const handleFaucet = async () => {
        if (!wallet.signer) return;
        setFaucetLoading(true);
        try {
            const tokenContract = new Contract(getTokenAddress(), ERC20_ABI, wallet.signer);
            const tx = await tokenContract.faucet();
            await tx.wait();
            await fetchBalance();
        } catch (err: any) {
            console.error('Faucet error:', err);
        } finally {
            setFaucetLoading(false);
        }
    };

    // --- Send remittance ---
    const handleSend = async () => {
        if (!wallet.isConnected) {
            wallet.connectWallet();
            return;
        }

        if (!amount || parseFloat(amount) <= 0) return;
        if (!recipient) {
            setErrorMsg('Please enter a recipient address');
            setTxStep('error');
            return;
        }

        setTxStep('approving');
        setTxResult(null);
        setErrorMsg('');

        try {
            const tokenAddress = getTokenAddress();
            const tokenContract = new Contract(tokenAddress, ERC20_ABI, wallet.signer!);
            const remyraContract = new Contract(CONTRACTS.Remyra, REMYRA_ABI, wallet.signer!);

            // Get decimals and parse amount
            const decimals = await tokenContract.decimals();
            const amountParsed = parseUnits(amount, decimals);

            // Step 1: Check allowance and approve if needed
            const currentAllowance = await tokenContract.allowance(wallet.account, CONTRACTS.Remyra);
            if (currentAllowance < amountParsed) {
                const approveTx = await tokenContract.approve(CONTRACTS.Remyra, amountParsed);
                await approveTx.wait();
            }

            // Step 2: Send remittance
            setTxStep('sending');
            let tx;
            if (destChain > 0) {
                tx = await remyraContract.sendCrossChainRemittance(
                    tokenAddress, amountParsed, recipient, destChain, corridor
                );
            } else {
                tx = await remyraContract.sendRemittance(
                    tokenAddress, amountParsed, recipient, corridor
                );
            }

            const receipt = await tx.wait();

            // Step 3: Parse the RemittanceSent event
            let remittanceId = '0';
            let feeActual = fee;
            let convertedActual = convertedAmount;

            for (const log of receipt.logs) {
                try {
                    const parsed = remyraContract.interface.parseLog({
                        topics: log.topics as string[],
                        data: log.data,
                    });
                    if (parsed && parsed.name === 'RemittanceSent') {
                        remittanceId = parsed.args[0].toString();
                        feeActual = formatUnits(parsed.args[6], decimals);
                        convertedActual = formatUnits(parsed.args[5], decimals);
                    }
                } catch {
                    // skip non-matching logs
                }
            }

            setTxStep('confirmed');
            setTxResult({
                id: remittanceId,
                amount,
                token,
                recipient,
                destCurrency: corridor,
                fee: parseFloat(feeActual).toFixed(4),
                convertedAmount: parseFloat(convertedActual).toFixed(2),
                status: destChain > 0 ? 'Cross-chain Sent' : 'Completed',
                timestamp: new Date().toLocaleString(),
                txHash: receipt.hash,
            });

            // Refresh balance
            await fetchBalance();

        } catch (err: any) {
            console.error('Transaction error:', err);
            setTxStep('error');
            if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
                setErrorMsg('Transaction rejected by user');
            } else if (err.reason) {
                setErrorMsg(err.reason);
            } else if (err.message?.includes('insufficient funds')) {
                setErrorMsg('Insufficient balance for this transaction');
            } else {
                setErrorMsg(err.shortMessage || err.message || 'Transaction failed');
            }
        }
    };

    const resetTx = () => {
        setTxStep('idle');
        setTxResult(null);
        setErrorMsg('');
    };

    return (
        <section id="send" className={styles.section}>
            <h2 className="page-title">Send Remittance</h2>
            <p className={styles.subtitle}>Transfer stablecoins globally with sub-1% fees using Polkadot&apos;s XCM</p>

            <div className={styles.grid}>
                {/* Send Form */}
                <div className={`glass-card ${styles.formCard}`}>
                    <div className={styles.formHeader}>
                        <span className={styles.formIcon}>⇄</span>
                        <h3>Transfer Details</h3>
                    </div>

                    <div className={styles.formBody}>
                        {/* Token Select + Balance */}
                        <div className="input-group">
                            <div className={styles.tokenLabelRow}>
                                <label>Token</label>
                                {wallet.isConnected && balance !== null && (
                                    <span className={styles.balanceLabel}>
                                        Balance: <strong>{parseFloat(balance).toFixed(2)} {token}</strong>
                                    </span>
                                )}
                            </div>
                            <div className={styles.tokenSelect}>
                                {TOKENS.map(t => (
                                    <button
                                        key={t.symbol}
                                        type="button"
                                        className={`${styles.tokenOption} ${token === t.symbol ? styles.tokenActive : ''}`}
                                        onClick={() => setToken(t.symbol)}
                                    >
                                        <span>{t.icon}</span>
                                        <span>{t.symbol}</span>
                                    </button>
                                ))}
                            </div>
                            {/* Faucet button */}
                            {wallet.isConnected && (
                                <button
                                    type="button"
                                    className={styles.faucetBtn}
                                    onClick={handleFaucet}
                                    disabled={faucetLoading}
                                >
                                    {faucetLoading ? 'Minting...' : `🚰 Get 10,000 Test ${token}`}
                                </button>
                            )}
                        </div>

                        {/* Amount */}
                        <div className="input-group">
                            <label>Amount (USD)</label>
                            <div className={styles.amountWrap}>
                                <span className={styles.amountPrefix}>$</span>
                                <input
                                    type="number"
                                    className={`input-field ${styles.amountInput}`}
                                    placeholder="1,000.00"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    min="0"
                                />
                            </div>
                        </div>

                        {/* Corridor */}
                        <div className="input-group">
                            <label>Destination Currency</label>
                            <select
                                className="input-field"
                                value={corridor}
                                onChange={(e) => setCorridor(e.target.value)}
                            >
                                {CORRIDORS.map(c => (
                                    <option key={c.to} value={c.to}>
                                        {c.country} ({c.to}) — 1 USD = {c.rate} {c.to}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Destination Chain */}
                        <div className="input-group">
                            <label>Destination Chain</label>
                            <select
                                className="input-field"
                                value={destChain}
                                onChange={(e) => setDestChain(Number(e.target.value))}
                            >
                                {DEST_CHAINS.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.icon} {c.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Recipient */}
                        <div className="input-group">
                            <label>Recipient Address</label>
                            <input
                                type="text"
                                className="input-field"
                                placeholder="0x..."
                                value={recipient}
                                onChange={(e) => setRecipient(e.target.value)}
                            />
                        </div>

                        {/* Error Message */}
                        {txStep === 'error' && errorMsg && (
                            <div className={styles.errorBox}>
                                <span>⚠</span> {errorMsg}
                            </div>
                        )}

                        {/* Step Progress */}
                        {(txStep === 'approving' || txStep === 'sending') && (
                            <div className={styles.stepProgress}>
                                <div className={`${styles.stepDot} ${txStep === 'approving' ? styles.stepActive : styles.stepDone}`}>
                                    {txStep === 'approving' ? <span className={styles.spinner}></span> : '✓'}
                                </div>
                                <span className={styles.stepLabel}>Approve</span>
                                <div className={styles.stepLine}></div>
                                <div className={`${styles.stepDot} ${txStep === 'sending' ? styles.stepActive : ''}`}>
                                    {txStep === 'sending' ? <span className={styles.spinner}></span> : '2'}
                                </div>
                                <span className={styles.stepLabel}>Send</span>
                            </div>
                        )}

                        {/* Send Button */}
                        <button
                            type="button"
                            className={`btn btn-primary ${styles.sendBtn}`}
                            onClick={handleSend}
                            disabled={txStep === 'approving' || txStep === 'sending' || !amount}
                        >
                            {txStep === 'approving' ? (
                                <><span className={styles.spinner}></span> Approving Token...</>
                            ) : txStep === 'sending' ? (
                                <><span className={styles.spinner}></span> Sending Remittance...</>
                            ) : !wallet.isConnected ? (
                                'Connect Wallet to Send'
                            ) : (
                                `Send ${amount || '0'} ${token}`
                            )}
                        </button>
                    </div>
                </div>

                {/* Fee Breakdown Card */}
                <div className={styles.rightCol}>
                    <div className={`glass-card ${styles.feeCard}`}>
                        <div className={styles.feeHeader}>
                            <h3>Fee Breakdown</h3>
                            <span className={styles.feeBadge}>0.30%</span>
                        </div>

                        <div className={styles.feeRows}>
                            <div className={styles.feeRow}>
                                <span>You send</span>
                                <span className={styles.feeValue}>${amount || '0.00'} {token}</span>
                            </div>
                            <div className={styles.feeRow}>
                                <span>Remyra fee</span>
                                <span className={styles.feeValueGreen}>-${fee}</span>
                            </div>
                            <div className={styles.feeRow}>
                                <span>Exchange rate</span>
                                <span className={styles.feeValue}>1 USD = {selectedCorridor.rate} {corridor}</span>
                            </div>
                            <div className={`${styles.feeRow} ${styles.feeTotal}`}>
                                <span>Recipient gets</span>
                                <span className={styles.feeValueLarge}>{convertedAmount} {corridor}</span>
                            </div>
                        </div>

                        {amount && parseFloat(amount) > 0 && (
                            <div className={styles.savingsBox}>
                                <span className={styles.savingsIcon}>△</span>
                                <div>
                                    <div className={styles.savingsTitle}>You save ${savings}</div>
                                    <div className={styles.savingsDesc}>compared to Western Union</div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Tech Stack Badge */}
                    <div className={`glass-card ${styles.techCard}`}>
                        <h4 className={styles.techTitle}>Powered by Polkadot PVM</h4>
                        <div className={styles.techBadges}>
                            <span className={styles.techBadge}>⊞ Rust FX Oracle</span>
                            <span className={styles.techBadge}>⟁ XCM Cross-chain</span>
                            <span className={styles.techBadge}>◉ Native Assets</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Transaction Result Modal */}
            {txResult && (
                <div className={styles.modal} onClick={resetTx}>
                    <div className={`glass-card ${styles.modalContent}`} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalIcon}>✓</div>
                        <h3 className={styles.modalTitle}>Remittance {txResult.status}!</h3>
                        <div className={styles.modalDetails}>
                            <div className={styles.modalRow}>
                                <span>Remittance ID</span><span>#{txResult.id}</span>
                            </div>
                            <div className={styles.modalRow}>
                                <span>Amount Sent</span><span>${txResult.amount} {txResult.token}</span>
                            </div>
                            <div className={styles.modalRow}>
                                <span>Recipient Gets</span><span>{txResult.convertedAmount} {txResult.destCurrency}</span>
                            </div>
                            <div className={styles.modalRow}>
                                <span>Fee</span><span>${txResult.fee} (0.30%)</span>
                            </div>
                            <div className={styles.modalRow}>
                                <span>Tx Hash</span>
                                <span
                                    className={styles.txHash}
                                    title={txResult.txHash}
                                    onClick={() => navigator.clipboard.writeText(txResult.txHash)}
                                >
                                    {txResult.txHash.slice(0, 10)}...{txResult.txHash.slice(-8)} 📋
                                </span>
                            </div>
                            <div className={styles.modalRow}>
                                <span>Time</span><span>{txResult.timestamp}</span>
                            </div>
                        </div>
                        <button type="button" className="btn btn-primary" onClick={resetTx} style={{ width: '100%', marginTop: '16px' }}>
                            Done
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}
