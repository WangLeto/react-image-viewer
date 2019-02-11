import React, { Component } from 'react';
import ShowImageView from './ImageView';
import logo from './logo.svg';
import './App.scss';

class App extends Component {
  state = {
  }
  componentDidMount() {
    // if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development') {
      setTimeout(() =>
        ShowImageView(['https://cdn.sspai.com/article/86c69914-4545-bc1c-1310-2975d4fe8d6b.jpg?imageMogr2/quality/95/thumbnail/!700x233r/gravity/Center/crop/700x233', 'https://camo.githubusercontent.com/ba1b52bab595d4c1557f03bb4abf47acdf67f035/687474703a2f2f73722e6b737269612e636e2f6c6f676f2532306269676765722e706e67', 'https://ss0.bdstatic.com/70cFvHSh_Q1YnxGkpoWK1HF6hhy/it/u=3591249579,147186327&fm=26&gp=0.jpg']), 300);
    // }
  }
  showImageView = () => {
    ShowImageView(['https://cdn.sspai.com/article/86c69914-4545-bc1c-1310-2975d4fe8d6b.jpg?imageMogr2/quality/95/thumbnail/!700x233r/gravity/Center/crop/700x233', 'https://camo.githubusercontent.com/ba1b52bab595d4c1557f03bb4abf47acdf67f035/687474703a2f2f73722e6b737269612e636e2f6c6f676f2532306269676765722e706e67', 'https://ss0.bdstatic.com/70cFvHSh_Q1YnxGkpoWK1HF6hhy/it/u=3591249579,147186327&fm=26&gp=0.jpg'])
  }
  render() {
    return (
      <div className="App">
        <header className="App-header">
          <img src={logo} className="App-logo" alt="logo" />
          <p>
            Edit <code>src/App.js</code> and save to reload.
          </p>
          <button onClick={this.showImageView}>show ImageView</button>
        </header>
      </div>
    );
  }
}

export default App;
