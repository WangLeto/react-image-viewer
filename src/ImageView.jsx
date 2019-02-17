import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import './styles/ImageView.scss';

// 切换图片的方向
const orientation_left = -1, orientation_right = 1;

// 双击缩放----
// 默认缩放模式：⑴ 原始尺寸、⑵ 最长边充满、⑶ 最短边充满
const scaleModes = {
  OriginalSize: 0,
  LongSideFit: 1,
  ShortSideFit: 2,
  // Current Mode, always init as LongSideFit
  currentScaleMode: 1
};
const Actions = {
  OriginalSize: 0,
  LongSideFit: 1,
  ShortSideFit: 2,
  Free: 3,
  Move: 4
};
// 惯性移动倍数
const MoveRatio = 15;

// 自由缩放时，较长边最终的显示尺寸不小于屏幕的比例
const freeScaleMinRatioForLongSide = 0.5;
class ImageView extends Component {
  state = {
    showView: false,
    // 当前展示的图片序数
    currentIndex: this.props.currentIndex,
    // 当前图片缩放倍率
    scaleRatio: 1,
    // 显示顶栏
    showTopBar: true,
    // 平移量
    translateX: 0,
    translateY: 0,
    // 先在双击时启用吧
    enableTransformAnimation: false,
  }

  // 判断：如果短时间内离开，且无移动动作，则为工具栏切换
  startTouch = (e) => {
    if (this.timers.firstClickTimer) {
      this.recordTimer('doubleClickTimer', 300);
      this.clearTimeout('firstClickTimer');
    } else {
      this.recordTimer('firstClickTimer', 300, this.toggleTopBar);
    }
    this.touching = true;
    let touches = e.touches;
    // 记录起始点
    if (touches.length === 1) {
      let touch = touches[0];
      this.recordPreTouchPosition(touch.clientX, touch.clientY);
    } else {
      // 多指手势，以前两点为准
      let one = touches['0'];
      let two = touches['1'];
      this.preTouchesClientx1y1x2y2 = [one.clientX, one.clientY, two.clientX, two.clientY];
    }
  }

  stopTouch = (e) => {
    // 还有一个 touch，解除缩放模式，进入移动
    if (e.touches.length === 1) {
      let touch = e.touches[0];
      this.recordPreTouchPosition(touch.clientX, touch.clientY);
    } else if (e.touches.length === 0) {
      this.touching = false;
      this.preTouchesClientx1y1x2y2 = [];
      // console.log(`before touch stop: %c${Object.keys(Actions).find(key => Actions[key] === this.state.lastAction)}`,
      //   'color:green; font-weight:bold');
      if (this.timers.doubleClickTimer) {
        // todo 暂时移除了双击缩放
        let removedTouch = e.changedTouches[0];
        this.doubleClickScale(removedTouch.target, removedTouch.clientX, removedTouch.clientY);
        return;
      }
      if (!this.timers.firstClickTimer && !this.timers.doubleClickTimer) {
        if (this.state.lastAction === Actions.Move) {
          this.inertiaDamp.extraMove();
        } else if (this.state.lastAction === Actions.Free) {
          this.inertiaDamp.scaleDamp();
        }
      }
    }
  }

  touchMove = (e) => {
    let touches = e.touches;
    // 取消单击和双击双击计时
    this.clearTimeout('firstClickTimer');
    this.clearTimeout('doubleClickTimer');
    if (touches.length > 1) {
      this.freeScale(e);
    } else {
      // moving ------------------------------------- (　 ´-ω ･)▄︻┻┳══━一
      // 防止 free scale 抬手时触发 move
      if (this.timers.justFreeScaled) {
        return;
      }
      let touch = touches[0];
      let rect = this.imgBounding.rect;
      let posX = rect.left + this.rectLeft2TransXFix;
      let posY = rect.top + this.rectTop2TransYFix;
      // 仅在高度大于 Y轴高度 的情况下支持 Y 轴移动
      let maskSize = this.maskSize;
      let forbidTranslateY = false;
      if (rect.height <= maskSize.height) {
        forbidTranslateY = true;
      }
      let transX = touch.pageX - this.preTouchPosition.x + posX;
      let transY = forbidTranslateY ? this.state.translateY : touch.pageY - this.preTouchPosition.y + posY;

      this.setState({
        translateX: transX,
        translateY: transY,
        transition: '',
        enableTransformAnimation: false,
        lastAction: Actions.Move
      });
      this.recordPreTouchPosition(touch.clientX, touch.clientY);
      this.inertiaDamp.recordTranslate(touch.pageX, touch.pageY);
    }
  }

  // 记录 move 最后 2 个位移数据，从而实现惯性效果
  // [{translateX: n, translateY: n}, {..}]
  inertiaDamp = {
    // 写 2 个 null 的话有时会出错，why？
    lastTwoMove: [{ x: 0, y: 0 }, { x: 0, y: 0 }],
    recordTranslate: function (x, y) {
      this.lastTwoMove.shift();
      this.lastTwoMove.push({ x: x, y: y });
    },
    // 进入此处时不可能处于缓动过程中
    extraMove: () => {
      let state = this.state;
      if (state.lastAction !== Actions.Move) {
        return;
      }

      let lastTwo = this.inertiaDamp.lastTwoMove;
      let { width: mWidth, height: mHeight } = this.maskSize;
      let { top, right, bottom, left, height, width } = this.imgBounding.rect;
      let dimen = this.imagesSizes[state.currentIndex];
      let newScaleRatio = this.inertiaDamp.scaleRatioCheck();
      if (newScaleRatio !== state.scaleRatio) {
        width = dimen.width * newScaleRatio;
        height = dimen.height * newScaleRatio;
        left = mWidth / 2 - width / 2;
        right = mWidth / 2 + width / 2;
        top = mHeight / 2 - height / 2;
        bottom = mHeight / 2 + height / 2;
      }

      let extraX = (lastTwo[1].x - lastTwo[0].x) * MoveRatio;
      let extraY = height > mHeight ? (lastTwo[1].y - lastTwo[0].y) * MoveRatio : 0;
      let transX = extraX + state.translateX;
      let transY = extraY + state.translateY;
      let shouldDamp = false;

      if (height >= mHeight) {
        if (top > 0 || top + extraY > 0) {
          shouldDamp = true;
          transY = this.rectTop2TransYFix;
        }
        if (bottom < mHeight || bottom + extraY < mHeight) {
          shouldDamp = true;
          transY = state.translateY + mHeight - bottom;
        }
      } else {
        // 不触发回弹动画
        transY = (1 - newScaleRatio) * (dimen.height / 2);
      }
      // fixme review needed
      if (width < mWidth) {
        shouldDamp = true;
        transX = (1 - newScaleRatio) * (dimen.width / 2);
      } else {
        if (left + extraX > 0) {
          shouldDamp = true;
          transX = state.translateX - left;
        } else if (right + extraX < mWidth) {
          shouldDamp = true;
          transX = state.translateX + (mWidth - right);
        }
      }

      // todo 切换前就展示下张图片

      let wannaShift = false;
      let shiftOrientation = null;
      if (left > 0 && extraX > 0) {
        wannaShift = true;
        shiftOrientation = orientation_left;
      } else if (right < mWidth && extraX < 0) {
        wannaShift = true;
        shiftOrientation = orientation_right;
      }
      if (wannaShift && this.tryShiftImg(shiftOrientation)) {
        return;
      }

      let t = Math.log10(Math.sqrt(extraX * extraX + extraY * extraY) / 75);
      let animation = `all ${(t <= 0.1 ? 0.1 : t >= 1 ? 1 : t).toFixed(3)}s cubic-bezier(0.18, 0.8, 0.24, 0.96)`;
      if (extraX === 0 && extraY === 0 && !shouldDamp) {
        return;
      }

      this.setState({
        scaleRatio: newScaleRatio,
        translateX: transX,
        translateY: transY,
        transition: shouldDamp ? 'all 400ms cubic-bezier(0.175, 0.885, 0.32, 1.275)' : animation
      });
    },
    // scale 后的正骨（误）复位效果
    scaleDamp: () => {
      let state = this.state;
      let { width: mWidth, height: mHeight } = this.maskSize;
      let { top, right, bottom, left, height, width } = this.imgBounding.rect;
      let transX = state.translateX;
      let transY = state.translateY;
      let dimen = this.imagesSizes[state.currentIndex];
      let shouldDamp = false;
      let newScaleRatio = this.inertiaDamp.scaleRatioCheck();

      if (height >= mHeight) {
        if (top > 0) {
          shouldDamp = true;
          transY = this.rectTop2TransYFix;
        }
        if (bottom < mHeight) {
          shouldDamp = true;
          transY = state.translateY + mHeight - bottom;
        }
      } else {
        shouldDamp = true;
        transY = (1 - newScaleRatio) * (dimen.height / 2);
      }
      if (width < mWidth) {
        shouldDamp = true;
        transX = (1 - newScaleRatio) * (dimen.width / 2);
      } else {
        if (left > 0) {
          shouldDamp = true;
          transX = state.translateX - left;
        } else if (right < mWidth) {
          shouldDamp = true;
          transX = state.translateX + (mWidth - right);
        }
      }

      if (shouldDamp) {
        this.setState({
          scaleRatio: newScaleRatio,
          translateX: transX,
          translateY: transY,
          transition: 'all 400ms cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        });
      }
    },
    scaleRatioCheck: () => {
      let dimen = this.imagesSizes[this.state.currentIndex];
      let rect = this.imgBounding.rect;
      let maskSize = this.maskSize;
      // 图片过小的限制
      let newScaleRatio = null;
      if (rect.width < maskSize.width && rect.height < maskSize.height) {
        // 图片比原始显示小
        if (rect.width < dimen.width) {
          let longSide = rect.width / maskSize.width > rect.height / maskSize.height ? 'width' : 'height';
          // 令长边不小于屏幕的 freeScaleMinRatioForLongSide 倍，但以初始显示效果为准
          if (rect[longSide] / maskSize[longSide] < freeScaleMinRatioForLongSide) {
            if (maskSize[longSide] * freeScaleMinRatioForLongSide > dimen[longSide]) {
              newScaleRatio = 1;
            } else {
              newScaleRatio = maskSize[longSide] * freeScaleMinRatioForLongSide / dimen[longSide];
            }
          }
        }
      }
      return newScaleRatio ? newScaleRatio : this.state.scaleRatio;
    }
  }

  tryShiftImg = (shiftOrientation) => {
    let allNum = this.imagesSizes.length;
    if (allNum === 1) {
      return;
    }
    let state = this.state;
    if (state.currentIndex === 0 && shiftOrientation === orientation_left) {
      return;
    }
    if (state.currentIndex === allNum - 1 && shiftOrientation === orientation_right) {
      return;
    }
    this.setState({
      currentIndex: this.state.currentIndex + shiftOrientation,
      translateX: 0,
      translateY: 0,
      scaleRatio: 1,
      enableTransformAnimation: true
    }, () => {
      this.getRect2TranslateFix();
      this.imgBounding.loadImageBound(this.state.currentIndex);
    });
    return true;
  }

  distance = (x1, y1, x2, y2) => {
    let a = x1 - x2;
    let b = y1 - y2;
    return Math.sqrt(a * a + b * b);
  }

  freeScale = (e) => {
    let oldRatio = this.state.scaleRatio;
    let { left, top } = this.imgBounding.rect;
    let { clientX: oneClientX, clientY: oneClientY } = e.touches['0'];
    let { clientX: twoClientX, clientY: twoClientY } = e.touches['1'];
    let newRatio = this.distance(oneClientX, oneClientY, twoClientX, twoClientY) /
      this.distance(...this.preTouchesClientx1y1x2y2) * oldRatio || 1;
    let newOrigin = this.relativeCoordinate((oneClientX + twoClientX) / 2, (oneClientY + twoClientY) / 2, left, top);
    let posX = left + this.rectLeft2TransXFix;
    let posY = top + this.rectTop2TransYFix;
    this.setState({
      scaleRatio: newRatio,
      translateX: posX - (newRatio - oldRatio) * (newOrigin.x),
      translateY: posY - (newRatio - oldRatio) * (newOrigin.y),
      transition: '',
      enableTransformAnimation: false,
      lastAction: Actions.Free
    });
    this.preTouchesClientx1y1x2y2 = [oneClientX, oneClientY, twoClientX, twoClientY];
    this.recordTimer('justFreeScaled', 100);
  }

  doubleClickScale = (target, clientX, clientY) => {
    // todo 检测图片长宽比、原始尺寸等问题，适当跳过某些缩放模式
    scaleModes.currentScaleMode = (scaleModes.currentScaleMode + 1) % 3;
    console.log(`ratio ${scaleModes.currentScaleMode}`)
    const getScaleRatio = (scaleMode) => {
      let dimen = this.imagesSizes[this.state.currentIndex];
      switch (scaleMode) {
        case scaleModes.OriginalSize:
          return dimen.originWidth / this.maskSize.width;
        case scaleModes.ShortSideFit:
          return dimen.width > dimen.height ? this.maskSize.height / dimen.height : this.maskSize.width / dimen.width;
        default:
          return 1;
      }
    };

    let newRatio = getScaleRatio(scaleModes.currentScaleMode);
    let rect = this.imgBounding.rect;
    let newOrigin = {
      x: this.relativeCoordinate(clientX, clientY, rect.left, rect.top).x,
      y: this.imagesSizes[this.state.currentIndex].height / 2,
    };
    let posX = rect.left + this.rectLeft2TransXFix;
    let posY = rect.top + this.rectTop2TransYFix;
    let transX = posX - (newRatio - this.state.scaleRatio) * newOrigin.x;
    let transY = posY - (newRatio - this.state.scaleRatio) * newOrigin.y;
    if (scaleModes.currentScaleMode === scaleModes.LongSideFit) {
      transX = transY = 0;
    }
    this.setState({
      translateX: transX,
      translateY: transY,
      scaleRatio: newRatio,
      transition: '',
      enableTransformAnimation: true,
      // 缩放部分编号是统一的
      lastAction: scaleModes.currentScaleMode
    }, () => setTimeout(() => {
      // todo 使用 transition end 事件回调来做
      this.inertiaDamp.scaleDamp();
    }, 400));
  }

  transStyle = (idx) => {
    let state = this.state;
    let style = Object.assign({},
      state.currentIndex === idx ?
        {
          transform: `matrix(${state.scaleRatio}, 0, 0, ${state.scaleRatio}, ` +
            `${state.translateX - this.maskSize.width * idx}, ${state.translateY}) translateZ(0)`,
          transition: state.transition,
          willChange: `transform`
        } :
        {
          transform: `matrix(1, 0, 0, 1, ${-this.maskSize.width * (state.currentIndex)}, 0)`,
        },
      state.enableTransformAnimation ? { transition: 'transform 400ms' } : null
    );
    return style;
  }

  render() {
    return (
      // todo 添加进出场动画？
      <div className="mask">
        <Topbar close={this.props.close} download={this.download} isShow={this.state.showTopBar}
          // todo 改进获取图片总数的方法
          indexInfo={`${this.state.currentIndex + 1} / ${this.props.images.length}`}></Topbar>
        <div className="images"
          onTouchEnd={this.stopTouch}
          onTouchMove={this.touchMove}
          onTouchStart={this.startTouch}
          onTouchCancel={this.cancelTouch}>
          {this.props.images.map((src, idx) =>
            <div key={idx}>
              <img draggable src={src} key={idx} alt={`${idx + 1}`}
                style={this.transStyle(idx)}
                onLoad={(e) => this.onImagesLoad(e, idx)}
                onContextMenu={(e) => { e.preventDefault() }} /></div>)}
        </div>
      </div>
    );
  }

  toggleTopBar = () => {
    if (this.touching) {
      return;
    }
    this.setState({
      showTopBar: !this.state.showTopBar
    });
  }

  clearTimeout = (timerKey) => {
    if (!this.timers[timerKey]) {
      return;
    }
    clearTimeout(this.timers[timerKey]);
    this.timers[timerKey] = null;
  }

  recordTimer = (timerKey, timeout, callback) => {
    this.clearTimeout(timerKey);
    this.timers[timerKey] = setTimeout(() => {
      callback ? callback.apply() : void (0);
      this.clearTimeout(timerKey);
    }, timeout);
  }

  recordPreTouchPosition = (x, y) => {
    this.preTouchPosition = { x: x, y: y };
  }

  // 计算图片实时高度转 translateY 所需补充值; translateX 同理
  // 受到缓动动画影响，translateY 不等于图片实时值（translateY = 0 位于中部）
  //   |------------------------|
  //   |                        | \__This is -rectTop2TransYFix （notice the MINUS）
  //   |                        |/
  //   |   ``````````````````   |<--This is where translateY == 0
  //   |   ` image top half `   | \
  //   |---`-middle-line----`---|  > Whole Image
  //   |   `                `   |/
  //   |   ``````````````````   |
  //   |   |                    |      The whole rectangle is Your Screen, also as the modal Mask
  //   |   |                    |
  //   |------------------------|
  //   |   |
  //   >===< This is -rectLeft2TransXFix
  //
  // 由 rect.top + this.rectTop2TransYFix 获取实时 translateY
  rectTop2TransYFix = 0;
  rectLeft2TransXFix = 0;
  getRect2TranslateFix = () => {
    let { height: maskHeight, width: maskWidth } = this.maskSize;
    let dimen = this.imagesSizes[this.state.currentIndex];
    this.rectTop2TransYFix = - (maskHeight - dimen.height) / 2;
    this.rectLeft2TransXFix = - (maskWidth - dimen.width) / 2;
  }

  // 由于某个事件取消了触摸
  // 1. 例如触摸过程被一个模态的弹出框打断
  // 2. 触点离开了文档窗口，而进入了浏览器的界面元素、插件或者其他外部内容区域
  // 3. 当用户产生的触点个数超过了设备支持的个数，从而导致 TouchList 中最早的 Touch 对象被取消
  cancelTouch = (e) => {
    // 可以使用微信长按触发
    if (e.touches.length === 0) {
      Object.keys(this.timers).map(key => this.clearTimeout(key));
      this.touching = false;
    }
  }

  timers = {
    firstClickTimer: null,
    doubleClickTimer: null,
    // 补充：防止 free scale 后短时间内触发瞬移 move（未及时更新 lastTwo）
    justFreeScaled: null
  };

  touching = false;
  // 记录图片的初始显示大小、图片原始大小
  imagesSizes = [];
  // 双指 / 多指，记录前一次的两触摸点
  preTouchesClientx1y1x2y2 = [];
  // 接触点 - 图片左上角的值
  preTouchPosition = null;

  maskSize = {
    width: 0,
    height: 0
  }

  getMaskSize = () => {
    // 从 mask 换为直接获取 body 尺寸，从而可以在 will mount 阶段就可以获取
    let width = document.body.clientWidth;
    let height = document.body.clientHeight;
    return { width: width, height: height };
  };

  // 获取当前图片的位置
  imgBounding = {
    img: null,
    get rect() {
      return this.img.getBoundingClientRect();
    },
    loadImageBound(index) {
      // console.log(`load image bound %c${index}`, 'color: orange; font-weight: bold');
      this.img = document.querySelectorAll('.images img')[index];
    }
  }

  // 绝对坐标转相对坐标，因为 transform-origin 只接受原始坐标值
  relativeCoordinate = (x, y, left, top) => {
    let ratio = this.state.scaleRatio;
    let cx = (x - left) / ratio;
    let cy = (y - top) / ratio;
    return { x: cx, y: cy };
  }

  updateOnResize = (() => {
    let tick = null;
    const update = () => {
      // 注意依赖关系：计算 matrix 时用到了 maskSize，所以必须最先更新
      this.maskSize = this.getMaskSize();
      this.setState({
        translateX: 0,
        translateY: 0,
        scaleRatio: 1,
        enableTransformAnimation: false
      }, callback.bind(this));
      // I use the function keyword declaration to display the executing order better 
      // because jslint will warn the arrow function being used before defined.
      function callback() {
        let imgs = document.querySelectorAll('.images img');
        imgs.forEach((img, idx) => {
          let size = this.imagesSizes[idx];
          size.width = img.width;
          size.height = img.height;
        });
        this.getRect2TranslateFix();
      };
    };
    return () => {
      // this.recordTimer 不适用，这里需要 debounce 函数
      clearTimeout(tick);
      tick = setTimeout(update, 100);
    };
  })();

  onImagesLoad = ({ target: img }, idx) => {
    this.imagesSizes[idx] = {
      width: img.width,
      height: img.height,
      originWidth: img.naturalWidth,
      originHeight: img.naturalHeight
    };
    if (idx === this.state.currentIndex) {
      this.getRect2TranslateFix();
    }
  }

  disableBodyMove = (e) => {
    e.preventDefault();
  }

  componentWillMount = () => {
    window.addEventListener('resize', this.updateOnResize);
    let passiveSupport = false;
    try {
      let option = Object.defineProperty({}, 'passive', {
        get: () => {
          passiveSupport = true;
          return false;
        }
      });
      window.addEventListener('passivetest', null, option);
    } catch (err) { }
    document.body.addEventListener('touchmove', this.disableBodyMove, passiveSupport ? { passive: false } : false);
    this.maskSize = this.getMaskSize();
  }

  componentDidMount = () => {
    this.imgBounding.loadImageBound(this.state.currentIndex);
  }

  componentWillUnmount = () => {
    this.props.onUnmount();
    window.removeEventListener('resize', this.updateOnResize);
    document.body.removeEventListener('touchmove', this.disableBodyMove);
  }

  download = async (e, filename) => {
    // todo 手机上无法通用地实现，目前仅发现 chrome 支持通过 blob 保存
    alert('call native method!')
  }
}

function Topbar(props) {
  return (
    <div className="top" style={{ transform: props.isShow ? null : `translateY(-120%)` }}>
      <div className="back" onClick={props.close}></div>
      <div className="index">{props.indexInfo}</div>
      <div className="download" onClick={props.download}></div>
      <div className="shadow"></div>
    </div>
  );
}

/* future job
function DescriptionPanel(props) {
  return (
    <div className="bottom">
      <div className="title">{props.description.title}</div>
      <div className="content">{props.description.content}</div>
    </div>
  );
}*/

/*
 * props: 传入图片的字符串（单张）或数组（多张）
 * props: 传入对象   { images: 数组, onClose: 关闭时的回调函数 }
 */
// todo 传入：是否允许下载、current index、是否循环展示
function ShowImageView(props = {}) {
  let container = document.querySelector('.__image_view__');
  if (container) {
    document.body.appendChild(container);
  } else {
    container = document.createElement('div');
    container.className = "__image_view__";
    document.body.appendChild(container);
  }

  if (typeof props === 'string') {
    props = {
      images: [props]
    };
  } else if (Array.isArray(props)) {
    props = {
      images: props
    };
  }
  // { images: Array(string), currentIndex: number }
  props = Object.assign({ currentIndex: 0 }, props);

  if (typeof props.images === 'undefined') {
    throw new Error('Didn\'t pass the necessary parameters!');
  }

  const component = React.createElement(ImageView, Object.assign(props, {
    close: () => {
      ReactDOM.render(null, container);
    },
    onUnmount: () => {
      const container = document.querySelector('.__image_view__');
      ReactDOM.unmountComponentAtNode(container);
      if (props.onClose instanceof Function) {
        props.onClose();
      }
    }
  }));
  ReactDOM.render(component, container);
}

export default ShowImageView;