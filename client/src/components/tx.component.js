import React, { useState } from 'react';
import TXDetail from './txdetail.component';

function TX(props) {
    const [minimized, setMinimized] = useState(true);
    let totalSent = props.data.sent + props.data.mint;
    let ratio = (totalSent / props.data.loop) * 100;
    ratio = ratio.toFixed(2);
    let totalReceipts = props.data.receipts.transfers + props.data.receipts.mints + props.data.receipts.reverts;
    if(minimized) {
        return (
            <div>
            
                <p>Cycles {props.data.loop} Ratio {ratio}% Receipts {totalReceipts}
                <button type="button" onClick={() => setMinimized(false)}>
                    TX Details
                </button>
                </p>
            </div>
        )
    } else {
        return (
            <div>
                <TXDetail data={props.data} />
                <button type="button" onClick={() => setMinimized(true)}>
                    Minimize
                </button>
            </div>
        )
    }
    
    // }
}

export default TX;