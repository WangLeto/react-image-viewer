import React, { PureComponent } from 'react';
import ReactDOM from 'react-dom';
import './styles/ImageView.scss';

// 切换图片的方向
const orientation_left = -1, orientation_right = 1;

const Actions = {
  doubleClickScale: 1,
  shiftImage: 2,
  free: 3,
  move: 4
};
// 惯性移动倍数
const MoveRatio = 15;

// 自由缩放时，较长边最终的显示尺寸不小于自动生成比例的比例
// finalAllowedMinRatio = freeScaleRatioByMinRatio * ratioList.min
const freeScaleRatioByMinRatio = 0.6;

// 测试浏览器是否支持较新的 addEventListener 参数；因为闭包，所以只会执行一次
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

// 离开时的图片序数，返回打开时以此为据
let lastVisitImageIndex = 0;

// 使用 PureComponent，state 中如果使用 Array / Object，则需要在 shouldComponentUpdate 额外处理，或使用 immutable 思想
class ImageView extends PureComponent {
  constructor(props) {
    super(props);
    let { width: mWidth, height: mHeight } = this.getMaskSize();
    this.maskRef = React.createRef();
    this.state = {
      // 当前展示的图片序数
      currentIndex: this.props.currentIndex,
      // 当前图片缩放倍率
      scaleRatio: 1,
      // 显示顶栏
      showTopBar: true,
      // 平移量
      translateX: 0,
      translateY: 0,
      // 双击时、切换图片时设为 true，产生动画效果
      enableTransformAnimation: false,
      transition: '',
      // 从外部移入 state 内部，以配合 pure component 特性
      maskWidth: mWidth,
      maskHeight: mHeight,
    };
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
        let removedTouch = e.changedTouches[0];
        this.doubleClickScale(removedTouch.target, removedTouch.clientX, removedTouch.clientY);
        this.clearTimeout('doubleClickTimer');
        return;
      }
      if (!this.timers.firstClickTimer && !this.timers.doubleClickTimer) {
        if (this.state.lastAction === Actions.move) {
          this.inertiaDamp.extraMove();
        } else if (this.state.lastAction === Actions.free) {
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
      let forbidTranslateY = false;
      // 乘以 1.005 容错：280 * 1.005 = 281.4
      if (rect.height <= this.state.maskHeight * 1.01) {
        forbidTranslateY = true;
      }
      let transX = touch.clientX - this.preTouchPosition.x + posX;
      let transY = forbidTranslateY ? this.state.translateY : touch.clientY - this.preTouchPosition.y + posY;

      this.setState({
        translateX: transX,
        translateY: transY,
        transition: '',
        enableTransformAnimation: false,
        lastAction: Actions.move
      });
      this.recordPreTouchPosition(touch.clientX, touch.clientY);
      this.inertiaDamp.recordTranslate(touch.clientX, touch.clientY);
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
      if (state.lastAction !== Actions.move) {
        return;
      }

      let lastTwo = this.inertiaDamp.lastTwoMove;
      let mWidth = this.state.maskWidth, mHeight = this.state.maskHeight;
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
      // using `height > mHeight` as condition leads to bounce
      let extraY = height > mHeight * 1.02 ? (lastTwo[1].y - lastTwo[0].y) * MoveRatio : 0;
      let transX = extraX + state.translateX;
      let transY = extraY + state.translateY;
      let shouldDamp = false;

      if (height >= mHeight) {
        if (top > 0 || top + extraY > 0) {
          shouldDamp = true;
          transY = this.rectTop2TransYFix;
        } else if (bottom < mHeight || bottom + extraY < mHeight) {
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
        transition: shouldDamp ? 'all 200ms cubic-bezier(0.18, 0.89, 0.38, 1.2)' : animation
      });
    },
    // scale 后的正骨（误）复位效果
    scaleDamp: () => {
      let state = this.state;
      let mWidth = this.state.maskWidth, mHeight = this.state.maskHeight;
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
        } else if (bottom < mHeight) {
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
          transition: 'all 200ms cubic-bezier(0.18, 0.89, 0.38, 1.2)'
        });
      }
    },
    scaleRatioCheck: () => {
      let rect = this.imgBounding.rect;
      let mWidth = this.state.maskWidth, mHeight = this.state.maskHeight;
      let minRatio = this.doubleScaleRatios.minRatio;
      // 图片过小的限制
      let ratio = this.state.scaleRatio;
      if (rect.width < mWidth && rect.height < mHeight) {
        if (ratio < minRatio) {
          return minRatio * freeScaleRatioByMinRatio;
        }
      }
      return ratio;
    }
  }

  tryShiftImg = (shiftOrientation) => {
    let allNum = this.props.images.length;
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
      enableTransformAnimation: true,
      lastAction: Actions.shiftImage
    }, () => {
      this.getRect2TranslateFix();
      this.imgBounding.loadImageBound(this.state.currentIndex);
      this.doubleScaleRatios.updateScaleRatioList();
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
      lastAction: Actions.free
    });
    this.preTouchesClientx1y1x2y2 = [oneClientX, oneClientY, twoClientX, twoClientY];
    this.recordTimer('justFreeScaled', 100);
  }

  doubleClickScale = (target, clientX, clientY) => {
    let { width, height } = this.imagesSizes[this.state.currentIndex];
    let newRatio = this.doubleScaleRatios.nextRatio;
    let { left, top } = this.imgBounding.rect;
    let mWidth = this.state.maskWidth, mHeight = this.state.maskHeight;
    let newOrigin = this.relativeCoordinate(clientX, clientY, left, top);
    let transX = left + this.rectLeft2TransXFix - (newRatio - this.state.scaleRatio) * newOrigin.x;
    let transY = top + this.rectTop2TransYFix - (newRatio - this.state.scaleRatio) * newOrigin.y;

    if (height * newRatio < mHeight) {
      transY = -(newRatio - 1) * height / 2;
    } else {
      let finalBottom = transY - this.rectTop2TransYFix + height * newRatio;
      if (finalBottom < mHeight) {
        transY += mHeight - finalBottom;
      }
      let finalTop = transY - this.rectTop2TransYFix;
      if (finalTop > 0) {
        transY -= finalTop;
      }
    }
    if (width * newRatio <= mWidth) {
      transX = -(newRatio - 1) * width / 2;
    } else {
      let finalLeft = transX - this.rectLeft2TransXFix;
      if (finalLeft > 0) {
        transX -= finalLeft;
      }
      let finalRight = transX - this.rectLeft2TransXFix + width * newRatio;
      if (finalRight < mWidth) {
        transX += mWidth - finalRight;
      }
    }

    this.setState({
      translateX: transX,
      translateY: transY,
      scaleRatio: newRatio,
      transition: '',
      enableTransformAnimation: true,
      lastAction: Actions.doubleClickScale
    });
  }

  transStyle = (idx) => {
    let state = this.state;
    let mWidth = this.state.maskWidth;
    let style = Object.assign({},
      state.currentIndex === idx ?
        {
          transform: `matrix(${state.scaleRatio}, 0, 0, ${state.scaleRatio}, ` +
            `${state.translateX - mWidth * idx}, ${state.translateY}) translateZ(0)`,
          transition: state.transition,
          willChange: `transform`
        } :
        {
          transform: `matrix(1, 0, 0, 1, ${-mWidth * (state.currentIndex)}, 0)`,
        },
      state.enableTransformAnimation ? { transition: 'transform 200ms' } : null
    );
    return style;
  }

  render() {
    return (
      <div className="mask" ref={this.maskRef} onTransitionEnd={this.maskTransitionEnd}>
        <Topbar close={this.closeWrap} download={this.download} isShow={this.state.showTopBar} enableDownload={this.props.enableDownload}
          indexInfo={`${this.state.currentIndex + 1} / ${this.props.images.length}`}></Topbar>
        <div className="images"
          onTouchEnd={this.stopTouch} onTouchMove={this.touchMove} onTouchStart={this.startTouch} onTouchCancel={this.cancelTouch}>
          {this.props.images.map((src, idx) =>
            <div key={idx}><img draggable src={src} key={idx} alt={`${idx + 1}`}
              style={this.transStyle(idx)} onLoad={(e) => this.onImagesLoad(e, idx)} onContextMenu={(e) => { e.preventDefault() }} /></div>)}
        </div>
      </div>
    );
  }

  closeWrap = () => {
    this.maskRef.current.style.transform = 'translateX(100%)';
    this.imageViewerClosed = true;
    lastVisitImageIndex = this.state.currentIndex;
  }

  imageViewerClosed = false

  maskTransitionEnd = () => {
    if (this.imageViewerClosed) {
      this.props.close();
    }
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
    let dimen = this.imagesSizes[this.state.currentIndex];
    this.rectTop2TransYFix = - (this.state.maskHeight - dimen.height) / 2;
    this.rectLeft2TransXFix = - (this.state.maskWidth - dimen.width) / 2;
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

  getMaskSize = () => {
    // 从 mask 换为直接获取屏幕尺寸，从而可以在 will mount 阶段就可以获取
    // 不专业了不是，人家都准备取消 will mount 这个阶段的生命周期函数了
    let width = window.innerWidth;
    let height = window.innerHeight;
    return { width: width, height: height };
  };

  // 获取当前图片的位置
  imgBounding = {
    img: null,
    get rect() {
      // 有时 img 还没有被赋值，不应该啊？？
      if (this.img) {
        return this.img.getBoundingClientRect();
      }
      return { top: 0, right: 0, bottom: 0, left: 0, height: 0, width: 0 };
    },
    loadImageBound(index) {
      this.img = document.querySelectorAll('.images img')[index];
    }
  }

  doubleScaleRatios = {
    ratioLists: [],
    computeScale: (a, b) => {
      return a > b ? a / b : b / a;
    },
    that: this,
    get nextRatio() {
      let currentRatio = this.that.state.scaleRatio;
      let index = this.ratioLists.indexOf(currentRatio);
      if (index >= 0) {
        return this.ratioLists[(index + 1) % this.ratioLists.length];
      }
      return (this.ratioLists.map((r, i) =>
        ({ ratio: r, scale: currentRatio / r, idx: i })).sort((a, b) => b.scale - a.scale))[0].ratio;
    },
    updateScaleRatioList: () => {
      // console.log('update scale ratios');
      let ratios = [];
      let mWidth = this.state.maskWidth, mHeight = this.state.maskHeight;
      let { width, height, originHeight: oHeight } = this.imagesSizes[this.state.currentIndex];
      // 长宽适配，去除重复比例
      let heightScale = mHeight / height, widthScale = mWidth / width;
      ratios.push(heightScale);
      if (heightScale !== widthScale) {
        ratios.push(widthScale);
      }
      // 原始尺寸
      let originRatio = oHeight / height;
      if (!ratios.includes(originRatio)) {
        ratios.push(originRatio);
      }
      this.doubleScaleRatios.ratioLists = ratios;
    },
    get minRatio() {
      return this.ratioLists.sort()[0];
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
      let maskSize = this.getMaskSize();
      this.setState({
        translateX: 0,
        translateY: 0,
        scaleRatio: 1,
        enableTransformAnimation: false,
        maskHeight: maskSize.height,
        maskWidth: maskSize.width
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
        this.doubleScaleRatios.updateScaleRatioList();
      };
    };
    return () => {
      // debounce
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
    let noEmpty = !this.imagesSizes.includes(undefined);
    if (noEmpty && this.imagesSizes.length === this.props.images.length) {
      this.imgBounding.loadImageBound(this.state.currentIndex);
      this.doubleScaleRatios.updateScaleRatioList();
    }
  }

  disableBodyMove = (e) => {
    e.preventDefault();
  }

  componentWillMount = () => {
    // DO NOT use, this is a deprecated lifecycle api!
  }

  componentDidMount = () => {
    // show image viewer
    setTimeout(() => {
      this.maskRef.current.style.transform = 'translate(0,0)';
    });

    window.addEventListener('resize', this.updateOnResize);
    document.body.addEventListener('touchmove', this.disableBodyMove, passiveSupport ? { passive: false } : false);
  }

  componentWillUnmount = () => {
    window.removeEventListener('resize', this.updateOnResize);
    this.props.onUnmount();
    document.body.removeEventListener('touchmove', this.disableBodyMove);
  }

  download = async (e) => {
    // 手机上无法通用地实现，目前仅发现 chrome 支持通过 blob 保存
    alert('call native method!')
  }
}

function Topbar(props) {
  return (
    <div className="top" style={{ transform: props.isShow ? null : `translateY(-120%)` }}>
      <div className="back" onClick={props.close}></div>
      <div className="index">{props.indexInfo}</div>
      {props.enableDownload ?
        <div className="download" onClick={props.download}></div> : <div className="download noBackground"></div>}
      {/* <div className="shadow"></div> */}
    </div>
  );
}

/*
 * props: 传入图片的字符串（单张）或数组（多张）
 * props: 传入对象   { images: 数组, onClose: 关闭时的回调函数 }
 */
let mutex = false;
// todo 传入：是否允许下载、current index、是否循环展示
function ShowImageView(props = {}) {
  if (mutex) {
    console.warn('Image viewer has been showing');
    return;
  }
  mutex = true;

  let bodyOverflow = document.body.style.overflow;
  let viewerContainer = document.querySelector('.__image_view__');
  if (viewerContainer) {
    document.body.appendChild(viewerContainer);
  } else {
    viewerContainer = document.createElement('div');
    viewerContainer.className = "__image_view__";
    document.body.appendChild(viewerContainer);
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
  props = Object.assign({ currentIndex: 0, enableDownload: false }, props);

  if (typeof props.images === 'undefined') {
    throw new Error('Didn\'t pass the necessary parameters!');
  }
  if (props.currentIndex >= props.images.length) {
    console.error('Specified image index is larger than images count!');
    props.currentIndex = 0;
  }

  // fixme history bug
  if (props.enableHistory) {
    if (props.onClose !== undefined) {
      console.error('onClose callback function will not work with enableHistory!');
    }
    let state = {};
    for (let k in props) {
      if (typeof props[k] !== 'function') {
        state[k] = props[k];
      }
    }
    let markedState = { imageViewerClosed: true };
    if (window.history.state) {
      markedState = Object.assign(window.history.state, markedState);
    }
    // anonymous function could be registered multiple times, the normal won't
    window.addEventListener('popstate', (e) => onPopState(e, viewerContainer));
    window.history.replaceState(markedState, '', window.location.href);
    window.history.pushState(state, '', 'imageViewer');
  }
  const component = React.createElement(ImageView, Object.assign(props, {
    close: () => {
      // fixme url 不对
      if (props.enableHistory) {
        window.history.back();
      }
      closeViewer(viewerContainer);
    },
    onUnmount: () => {
      const container = document.querySelector('.__image_view__');
      ReactDOM.unmountComponentAtNode(container);
      document.body.style.overflow = bodyOverflow;
      if (props.onClose instanceof Function) {
        props.onClose.apply(null);
      }
    }
  }));
  ReactDOM.render(component, viewerContainer);
  document.body.style.overflow = 'hidden';
};

function closeViewer(viewerContainer) {
  ReactDOM.render(null, viewerContainer);
  mutex = false;
}

function onPopState(e, viewerContainer) {
  let state = e.state;
  if (state) {
    if (state.imageViewerClosed) {
      closeViewer(viewerContainer);
    } else if (state.currentIndex !== undefined) {
      state.currentIndex = lastVisitImageIndex;
      console.log(lastVisitImageIndex);
      delete state.imageViewerClosed;
      // console.log(state);
      ShowImageView(state);
    }
  }
}

export default ShowImageView;
