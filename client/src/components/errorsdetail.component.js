import React, { Component } from 'react';

class ERRORSDetail extends React.Component {
    render() {
        return (
            <div>Errors
            <p>Underpriced {this.props.data.underpriced}&nbsp;
             TX Receipt {this.props.data.transactionReceipt}&nbsp;
             Invalid JSON {this.props.data.invalidJSON} &nbsp;
             Nonce too Low {this.props.data.nonceTooLow} &nbsp;
             Tx Not Mined {this.props.data.txNotMined} &nbsp;
            Misc {this.props.data.misc}</p>
            </div>
        )
    }
}

export default ERRORSDetail