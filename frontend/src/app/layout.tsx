import type { Metadata } from "next";
import { Space_Mono } from "next/font/google";
import "./globals.css";

const spaceMono = Space_Mono({
    subsets: ["latin"],
    weight: ["400", "700"],
    variable: "--font-mono",
});

export const metadata: Metadata = {
    title: "Remyra — Cross-Chain Remittance on Polkadot",
    description: "Secure, decentralized, and instant cross-chain stablecoin remittances on Polkadot.",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className={spaceMono.variable}>
            <body>
                {children}
            </body>
        </html>
    );
}
