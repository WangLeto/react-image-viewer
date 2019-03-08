# React Image Viewer

An image viewer with native-like experience using react. Try the [demo](http://blog.letow.top/react-image-viewer)!

## Not_minify branch

This branch is developed for export unminified build files, further modify to adapt different framework.

When built, copy files in `build/js` as follow sequence: `runtime.js`, `***.chunk.js`, `main.***.js` into `showImageViewer.js`, and delete JavaScript code in `index.html`.

Delete `componentDidMounted` method content in the code which came from  `***.chunk.js`.

Add the below code into the start of `showImageViewer.js`:

```javascript
var __reactImageViewerRootName = '__react_image_viewer_root';
(function() {
  var rootEle = document.getElementById(__reactImageViewerRootName);
  if (!rootEle) {
    rootEle = document.createElement('div');
    rootEle.id = __reactImageViewerRootName;
    document.body.appendChild(rootEle);
  }
})();
(function() {
  // escaped by https://www.freeformatter.com/javascript-escape.html
  var styles = "---use above website to convert css(from build/css folder)---";
  var cssEle = document.createElement('style');
  cssEle.type = 'text/css';
  cssEle.innerHTML = styles;
  document.head.appendChild(cssEle);
})();

// notice: this declaration will be assigned
var ShowImageView = null;
```

and replace `function ShowImageView() {` to `ShowImageView = function() {`.

Modify code came from `main.***.js` in around last:

```javascript
react_dom_default.a.render(react_default.a.createElement(src_App, null), document.getElementById(__reactImageViewerRootName));
// notice it is used to be "root" instead of __reactImageViewerRootName
```

Modify added window jsonp name in code came from `***.chunk.js` (currently 6 places), for other framework based on webpack (such as vue) to compile correctly:

```javascript
(window["webpackJsonp"] = window["webpackJsonp"] || [])
// to
(window["webpackJsonp__"] = window["webpackJsonp__"] || [])
```

Last, if you would use `import` sytax, add this in the last line:

```javascript
export default ShowImageView;
```

---

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

