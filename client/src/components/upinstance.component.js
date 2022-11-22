import React, { Component } from 'react';
import TX from './tx.component.js';
import ERRORS from './errors.component';
import NETFAILURES from './netfailures.component';


class UPInstance extends React.Component {
    
    constructor(props) {
        super(props);
        this.state = {
            isLoaded: false,
            data: {},
            instanceNumber: props.instanceNumber
        };
    }

    fetchLatest() {
        fetch(`http://localhost:8080/p/${this.state.instanceNumber}/`)
        .then(res => res.json())
        .then(
            (result) => {
                console.log(result);
                this.setState({
                    isLoaded: true,
                    data: result
                });
            },
            // Note: it's important to handle errors here
            // instead of a catch() block so that we don't swallow
            // exceptions from actual bugs in components.
            (error) => {
                console.log(error)
                this.setState({
                    isLoaded: false,
                    error
                });
            }
        )
    }

    componentDidMount() {
        
        this.fetchLatest();
    }

    render() {
        // let data = {
        //     "usage":"86.6",
        //     "monitor": {
        //         "droppedNonces":{},
        //         "incrementGasPrice":{"amount":0},
        //         "tx":
        //             {
        //                 "loop":78,"sent":35,"checkPending":0,
        //                 "receipts":{
        //                     "transfers":0,"mints":0,"reverts":0
        //                 },
        //                 "mint":26,"attemptedTx":49,"attemptedMint":29,"hash":27,
        //             "errors":{"underpriced":30,
        //                 "transactionReceipt":94,
        //                 "invalidJSON":3,
        //                 "nonceTooLow":0,
        //                 "txNotMined":0,
        //                 "misc":0
        //             }
        //         },
        //         "networkFailures":
        //             {"econnreset":0,
        //             "econnrefused":0,
        //             "enotfound":0,
        //             "socketDisconnectedTLS":0,
        //             "socketHangUp":0,
        //             "timedout":0
        //         }
        //     }
        // }
        let { isLoaded, data, error } = this.state;

        if(error) {
            return (
                <div>
                    <p>ERROR {this.state.instanceNumber}</p>
                    <p>{this.state.error.message}</p>
                </div>
            )
        }
        if (isLoaded) {
            return (

                <div>
                    <p>HELLO {this.props.instanceNumber}</p>
                    
                    <TX data={data.tx}></TX>
                    <ERRORS data={data.tx.errors}></ERRORS>
                    <NETFAILURES data={data.networkFailures}></NETFAILURES>
                </div>
            )
        } else {
            return (
                <div>
                    <p>HELLO {this.props.instanceNumber}</p>
                </div>
            )
        }
        
    }
} 

export default UPInstance;