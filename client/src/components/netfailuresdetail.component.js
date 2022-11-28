import React, { Component } from 'react';

class NETFAILURESDetail extends React.Component {
    render() {
        return (
           
            <div>Network Failures
                <p>ECONNRESET {this.props.data.econnreset}&nbsp;
                ECONNREFUSED {this.props.data.econnrefused}</p>
                <p>ENOTFOUND {this.props.data.enotfound}&nbsp;
                Socket Disconnected {this.props.data.socketDisconnectedTLS}</p>
                <p>Socket Hangup {this.props.data.socketHangUp}&nbsp;
                Timedout {this.props.data.timedout}</p>
            </div>
        )
    }
}

export default NETFAILURESDetail