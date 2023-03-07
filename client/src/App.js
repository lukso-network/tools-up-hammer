import logo from './logo.svg';
import './App.css';
import UPInstance from './components/upinstance.component';

function App() {
  return (
    <div className="App">
      {/* <header className="App-header"> */}
        {/* <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.js</code> and save to reload.
        </p>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a> */}
      {/* </header> */}
      <UPInstance instanceNumber={5}></UPInstance>
      {/* <UPInstance instanceNumber={1}></UPInstance>
      <UPInstance instanceNumber={19}></UPInstance>
      <UPInstance instanceNumber={9}></UPInstance>
      <UPInstance instanceNumber={2}></UPInstance>
       */}
    </div>
  );
}

export default App;
