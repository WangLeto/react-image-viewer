import React, { Component } from 'react';
import ShowImageView from './ImageView';

class App extends Component {
  componentDidMount() {
    ShowImageView({
      images: ['https://is1-ssl.mzstatic.com/image/thumb/Purple118/v4/bc/ba/16/bcba16f8-49ce-c6b9-6226-d7d85a8556ea/source/256x256bb.jpg', 'https://camo.githubusercontent.com/ba1b52bab595d4c1557f03bb4abf47acdf67f035/687474703a2f2f73722e6b737269612e636e2f6c6f676f2532306269676765722e706e67', 'https://cdn.sspai.com/article/86c69914-4545-bc1c-1310-2975d4fe8d6b.jpg?imageMogr2/quality/95/thumbnail/!700x233r/gravity/Center/crop/700x233', 'https://ss0.bdstatic.com/70cFvHSh_Q1YnxGkpoWK1HF6hhy/it/u=3591249579,147186327&fm=26&gp=0.jpg'].reverse(),
    });
  }
  render() {
    return (
      <div className="App">
      </div>
    );
  }
}

export default App;
