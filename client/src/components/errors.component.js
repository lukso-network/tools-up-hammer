import React, { useState } from 'react';
import ERRORSDetail from './errorsdetail.component';
import { Button } from 'react-bootstrap';

function ERRORS(props) {
    const [minimized, setMinimized] = useState(true);
    let data = props.data;
    let totalErrors = data.underpriced + data.transactionReceipt + 
        data.invalidJSON + data.nonceTooLow + data.txNotMined + data.misc;
    if(minimized) {
        return (
            <div>Errors {totalErrors}
                <button type="button" onClick={() => setMinimized(false)}>
                    Error Details
                </button>
            </div>
        )
        
    } else {
        return (
            <div>
                <ERRORSDetail data={data} />
                <button type="button" onClick={() => setMinimized(true)}>
                    Error Minimize
                </button>
            </div>
        )
    }
    
}

export default ERRORS