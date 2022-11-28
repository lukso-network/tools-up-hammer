import React, { Component } from 'react';

class ERRORSDetail extends React.Component {
    render() {
        return (
            <div>Errors
            <p>Underpriced {this.props.data.underpriced}</p>
            <p>TX Receipt {this.props.data.transactionReceipt}</p>
            <p>Invalid JSON {this.props.data.invalidJSON}</p>
            <p>Nonce too Low {this.props.data.nonceTooLow}</p>
            <p>Tx Not Mined {this.props.data.txNotMined}</p>
            <p>Misc {this.props.data.misc}</p>
            </div>
        )
    }
}

export default ERRORSDetail