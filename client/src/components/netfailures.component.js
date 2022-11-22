import React, { useState } from 'react';
import NETFAILURESDetail from './netfailuresdetail.component';

function NETFAILURES(props) {
    const [minimized, setMinimized] = useState(true);
    if(minimized) {
        let data = props.data;
        let totalNetFailures = data.econnrefused + data.econnreset + data.enotfound +
            data.socketDisconnectedTLS + data.socketHangUp + data.timedout;
        return (
            <div>
                <p>Network Failures {totalNetFailures} 
                <button type="button" onClick={() => setMinimized(false)}>
                    Failures Details
                </button>
                </p>
            </div>
        )
    } else {
        return (
            <div>
                <NETFAILURESDetail data={props.data}></NETFAILURESDetail>
                <button type="button" onClick={() => setMinimized(true)}>
                    Failures Minimize
                </button>
            </div>
            )
        }
}

export default NETFAILURES