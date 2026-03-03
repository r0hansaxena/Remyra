import Header from './components/Header';
import SendRemittance from './components/SendRemittance';
import { useWallet } from './hooks/useWallet';
import styles from './App.module.css';

export default function App() {
    const wallet = useWallet();

    return (
        <>
            <Header wallet={wallet} />

            {/* Hero */}
            <section className={styles.hero}>
                <div className={styles.heroInner}>
                    <h1 className={styles.heroTitle}>Remyra</h1>
                    <p className={styles.heroSub}>
                        Cross-chain stablecoin remittances on Polkadot.
                        Send money globally with sub-1% fees, instant
                        settlement, and no intermediaries.
                    </p>
                    <div className={styles.heroBtns}>
                        <a href="#send" className="btn btn-primary">Send Money</a>
                        <a href="#how" className="btn btn-secondary">How It Works</a>
                        <a href="#features" className="btn btn-secondary">Features</a>
                    </div>
                </div>
            </section>

            {/* Send Form */}
            <main className="page" id="send">
                <SendRemittance wallet={wallet} />
            </main>

            {/* Features */}
            <section className={styles.section} id="features">
                <div className={styles.container}>
                    <div className={styles.featuresGrid}>
                        <div className={styles.featureCard}>
                            <div className={styles.featureIcon}>⚡</div>
                            <h3 className={styles.featureTitle}>Instant Transfers</h3>
                            <p className={styles.featureDesc}>
                                Remittances settle in seconds using
                                Polkadot's cross-chain messaging.
                                No waiting periods or complex
                                withdrawal processes.
                            </p>
                        </div>
                        <div className={styles.featureCard}>
                            <div className={styles.featureIcon}>◎</div>
                            <h3 className={styles.featureTitle}>No Intermediaries</h3>
                            <p className={styles.featureDesc}>
                                Direct on-chain transfers between
                                sender and recipient. Lower fees,
                                more transparency, better exchange
                                rates.
                            </p>
                        </div>
                        <div className={styles.featureCard}>
                            <div className={styles.featureIcon}>◈</div>
                            <h3 className={styles.featureTitle}>Sub-1% Fees</h3>
                            <p className={styles.featureDesc}>
                                Only 0.30% fee per transaction.
                                Save up to 95% compared to
                                traditional remittance providers
                                like Western Union.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* How It Works */}
            <section className={styles.section} id="how">
                <div className={styles.container}>
                    <div className={styles.howCard}>
                        <h2 className={styles.sectionTitle}>How It Works</h2>
                        <div className={styles.stepsGrid}>
                            <div className={styles.step}>
                                <div className={styles.stepNum}>1</div>
                                <h4 className={styles.stepTitle}>Connect Wallet</h4>
                                <p className={styles.stepDesc}>
                                    Connect your MetaMask or any EVM wallet
                                    to the Polkadot Hub network.
                                </p>
                            </div>
                            <div className={styles.step}>
                                <div className={styles.stepNum}>2</div>
                                <h4 className={styles.stepTitle}>Choose Amount</h4>
                                <p className={styles.stepDesc}>
                                    Select your stablecoin (USDT/USDC),
                                    enter the amount and destination currency.
                                </p>
                            </div>
                            <div className={styles.step}>
                                <div className={styles.stepNum}>3</div>
                                <h4 className={styles.stepTitle}>Send & Convert</h4>
                                <p className={styles.stepDesc}>
                                    The FX Oracle calculates real-time rates
                                    and the smart contract executes the transfer.
                                </p>
                            </div>
                            <div className={styles.step}>
                                <div className={styles.stepNum}>4</div>
                                <h4 className={styles.stepTitle}>Delivered</h4>
                                <p className={styles.stepDesc}>
                                    Recipient receives funds instantly
                                    on-chain or cross-chain via XCM.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Footer */}
            <section className={styles.cta}>
                <div className={styles.ctaInner}>
                    <h2 className={styles.ctaTitle}>Ready to Send?</h2>
                    <p className={styles.ctaSub}>
                        Join the decentralized remittance revolution today.
                    </p>
                    <div className={styles.ctaBtns}>
                        <a href="#send" className={styles.ctaBtn}>Try It Now</a>
                        <a href="https://github.com" target="_blank" rel="noreferrer" className={styles.ctaBtnOutline}>
                            View Source
                        </a>
                    </div>
                </div>
            </section>
        </>
    );
}
