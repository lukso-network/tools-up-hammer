import logo from './logo.svg';
import './App.css';
import UPInstance from './components/upinstance.component';

function buildColumn(n, offset=0) {
  let ups = [];
  
  for(let i=1; i<=n; i++) {
    let className = "UPStyle";
    let altCol = (offset/10) % 2
    let altCheck = 0;
    if (altCol != 0) {
      altCheck = 1;
    } 
    if (i%2 != altCheck) {
      className += " alt";
    } 
    console.log(className)
    ups.push(<div className={className}><UPInstance  instanceNumber={i+offset}></UPInstance></div>)
  }
  
  return ups;
}

function App() {
  return (
    <div className="App">
      <div class="colLeft">
        { buildColumn(10, 0) }
      </div>
      <div class="colMid">
        { buildColumn(10, 10) }
      </div>
      <div class="colRight">
        { buildColumn(10, 20) }
      </div>
    </div>
  );
}

export default App;
