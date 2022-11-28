import React, { Component } from 'react';

class TXDetail extends React.Component {
    render() {
        let totalSent = this.props.data.sent + this.props.data.mint;
        let ratio = totalSent / this.props.data.loop;
        ratio = ratio.toFixed(2);
        let totalReceipts = this.props.data.receipts.transfers + this.props.data.receipts.mints  +
            this.props.data.receipts.reverts;
        return (
            <div>
            
            <p>Tx Total {totalSent} Cycles {this.props.data.loop} Ratio {ratio}</p>
            <p>Transfer {this.props.data.sent} Attempted {this.props.data.attemptedTx}</p>
            <p>Mint {this.props.data.mint} Attempted {this.props.data.attemptedMint}</p>
            
            <p>Receipts {totalReceipts} TX Hashes {this.props.data.hash}</p>
            <p>TX Receipt {this.props.data.receipts.transfers}&nbsp;
            Mint Receipt {this.props.data.receipts.mints} &nbsp;
            Reverts {this.props.data.receipts.reverts}</p>
            
            </div>
        )
    }
}

export default TXDetail;