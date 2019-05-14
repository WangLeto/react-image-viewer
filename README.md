# React Image Viewer

An image viewer with native-like experience using react. Try the [demo](http://blog.letow.top/react-image-viewer)!

### `npm start`

Runs the app in the development mode. [http://localhost:3000](http://localhost:3000) to view it in the browser.

### `npm run build`

Build the project for deploy to `build` folder.

## How to use

```javascript
import ShowImageView from './ImageView';

class App extends Component {
  componentDidMount() {
    this.showImageView();
  }
  showImageView = () => {
    ShowImageView({
      // pass images' url in Array
      images: ['url1', 'url2'],
      // [optional] specify viewer's initial index
      currentIndex: 0,
      // [optional] specify callback function when close viewer
      onClose: () => console.log('viewer onclose callback'),
      // [optional] make go back action close image viewer instead of closing page
      enableGoBack: true
    });
  }
  // ...
}
```
As I tried, if you are using a router, it would be better to choose the router to implement a history go back operation instead of enabling the `enableGoBack`.


# React 图片查看器

用 React 打造接近原生体验的图片浏览器。[亲自体验](http://blog.letow.top/react-image-viewer)！

### `npm start`

使用开发模式运行程序，浏览器打开 `http://localhost:3000` 进行查看。

### `npm run build`

打包发布文件至 `build` 文件夹下。

## 使用方法

```javascript
import ShowImageView from './ImageView';

class App extends Component {
  componentDidMount() {
    this.showImageView();
  }
  showImageView = () => {
    ShowImageView({
      // 使用数组传递图片地址
      images: ['url1', 'url2'],
      // [可选] 执行最初展示图片的序数
      currentIndex: 0,
      // [可选] 指定关闭查看器时的回调函数
      onClose: () => console.log('viewer onclose callback'),
      // [可选] 进行返回操作时关闭图片查看器，而不是整个页面
      enableGoBack: true
    });
  }
  // ...
}
```
**注意：**如果你在使用 router，不要启用 `enableGoBack`，利用 router 自身来实现返回键的关闭效果。
