import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import './styles/ImageView.scss';

// 切换图片的方向
const orientation = {
  left: -1,
  right: 1
};
// move 时进行是否需要切换图片的判断
// let wannaShift = false;
// // 记录需要切换图片的方向
// let shiftOrientation = ORIENTATION.left;

let timers = {
  firstClickTimer: null,
  doubleClickTimer: null,
  // 补充：防止 free scale 后短时间内触发瞬移 move（未及时更新 lastTwo）
  justFreeScaled: null
};

// 双指 / 多指，记录前一次的两触摸点
let preTouchesClientx1y1x2y2 = [];

// 接触点 - 图片左上角的值
let preTouchPosition = [];
let touching = false;
// 手势缩放边界
// const MinScaleRatio = 0.2, MacScaleRatio = 3;
// {'0': {x: 200, y: 300}}
const imagesSizes = [];

// 用于从 rect.top 计算当前图片位置的真实 translateY
// —— 由于缓动动画，此时设定的 translateY 与图片位置并不对应
let rectTop2TransYFix = 0;
let rectLeft2TransXFix = 0;

// 双击缩放----
// 默认缩放模式：⑴ 原始尺寸、⑵ 最长边充满、⑶ 最短边充满
const scaleModes = {
  OriginalSize: 0,
  LongSideFit: 1,
  ShortSideFit: 2,
  // Current Mode, always init as LongSideFit
  // fixme 横屏时第二三张图有问题
  currentScaleMode: 1
};
const Actions = {
  OriginalSize: 0,
  LongSideFit: 1,
  ShortSideFit: 2,
  Free: 3,
  Move: 4
};
const getMaskSize = () => {
  let width = document.querySelector('.__image_view__ .mask').clientWidth;
  let height = document.querySelector('.__image_view__ .mask').clientHeight;
  return { width: width, height: height };
};
// 惯性移动倍数
const MoveRatio = 15;

const distance = (x1, y1, x2, y2) => {
  let a = x1 - x2;
  let b = y1 - y2;
  return Math.sqrt(a * a + b * b);
};

class ImageView extends Component {
  state = {
    // 当前展示的图片序数
    currentIndex: 0,
    // 缩放flag，缩放时屏蔽移动事件
    isScale: false,
    // 当前图片缩放倍率
    scaleRatio: 1,
    // 自由缩放
    // freeScale: false,
    // 当前接触的图片序数
    // target: 0,
    // 显示顶栏
    showTopBar: true,
    // 平移量
    translateX: 0,
    translateY: 0,
    // 先在双击时启用吧
    enableTransformAnimation: false,
    lastAction: null
  }

  // 判断：如果短时间内离开，且无移动动作，则为工具栏切换
  startTouch = (e) => {
    if (timers.firstClickTimer) {
      this.recordTimer('doubleClickTimer', 300);
      this.clearTimeout('firstClickTimer');
    } else {
      this.recordTimer('firstClickTimer', 300, this.toggleTopBar);
    }
    touching = true;
    let touches = e.touches;
    // 记录起始点
    if (touches.length === 1) {
      this.recordPreTouchPosition(e.touches['0']);
    } else {
      // 多指手势，以前两点为准
      let one = touches['0'];
      let two = touches['1'];
      preTouchesClientx1y1x2y2 = [one.clientX, one.clientY, two.clientX, two.clientY];
    }
  }

  stopTouch = (e) => {
    // 还有一个 touch，解除缩放模式，进入移动
    if (e.touches.length === 1) {
      this.setState({
        isScale: false
      });
      this.recordPreTouchPosition(e.touches['0']);
    } else if (e.touches.length === 0) {
      touching = false;
      preTouchesClientx1y1x2y2 = [];
      console.log(`last Action: %c${Object.keys(Actions).find(key => Actions[key] === this.state.lastAction)}`,
        'color:green; font-weight:bold');
      if (timers.doubleClickTimer) {
        // todo 暂时移除了双击缩放
        // let removedTouch = e.changedTouches[0];
        // this.doubleClickScale(removedTouch.target, removedTouch.clientX, removedTouch.clientY);
        return;
      }
      if (!timers.firstClickTimer && !timers.doubleClickTimer) {
        if (this.state.lastAction === Actions.Move) {
          this.inertiaDamp.extraMove(e.target);
        } else if (this.state.lastAction === Actions.Free) {
          this.inertiaDamp.scaleDamp(e.target);
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
      // 双指 move 事件，触发自由缩放
      if (!this.state.isScale) {
        this.setState({
          isScale: true
        });
      }
      this.freeScale(e);
    } else {
      // moving ------------------------------------- (　 ´-ω ･)▄︻┻┳══━一
      // 防止 free scale 抬手时触发 move
      if (timers.justFreeScaled) {
        return;
      }
      let touch = touches[0];
      let rect = e.target.getBoundingClientRect();
      let posX = rect.left + rectLeft2TransXFix;
      let posY = rect.top + rectTop2TransYFix;
      // 仅在高度大于 Y轴高度 的情况下支持 Y 轴移动
      let maskSize = this.maskSize;
      let forbidTranslateY = false;
      if (rect.height <= maskSize.height) {
        forbidTranslateY = true;
      }
      let transX = touch.pageX - preTouchPosition.x + posX;
      let transY = forbidTranslateY ? posY : touch.pageY - preTouchPosition.y + posY;

      this.setState({
        translateX: transX,
        translateY: transY,
        transition: '',
        enableTransformAnimation: false,
        lastAction: Actions.Move
      });
      this.recordPreTouchPosition(touch);
      this.inertiaDamp.recordTranslate(touch.pageX, touch.pageY);
    }
  }

  // 记录 move 最后 2 个位移数据，从而实现惯性效果
  // [{translateX: n, translateY: n}, {..}]
  inertiaDamp = {
    lastTwoMove: [null, null],
    out: this,
    recordTranslate: function (x, y) {
      this.lastTwoMove.shift();
      this.lastTwoMove.push({ x: x, y: y });
    },
    // 进入此处时不可能处于缓动过程中
    extraMove: function (target) {
      let state = this.out.state;
      if (state.lastAction !== Actions.Move) {
        return;
      }

      let lastTwo = this.lastTwoMove;
      let maskSize = this.out.maskSize;
      let rect = target.getBoundingClientRect();
      let dimen = imagesSizes[state.currentIndex];

      let extraX = (lastTwo[0].x - lastTwo[1].x) * MoveRatio;
      let extraY = rect.height > maskSize.height ? (lastTwo[0].y - lastTwo[1].y) * MoveRatio : 0;
      let transX = extraX + state.translateX;
      let transY = extraY + state.translateY;

      // 以下判断是否是 overflow，如是则需要弹回，阻尼部分
      let shouldDamp = false;
      // 图片高度大于屏幕时（图片高度小于屏幕时禁止 Y 轴移动）
      // fixme 仅第一张图正确回弹到边缘，第二张图不能显示最上方、最下方
      if (rect.height >= maskSize.height) {
        if (rect.top > 0 || rect.top + extraY > 0) {
          // 下拉溢出，或惯性移动溢出
          shouldDamp = true;
          transY = rectTop2TransYFix;
        } else if (rect.bottom < maskSize.height || rect.bottom + extraY < maskSize.height) {
          // 上拉溢出，或惯性移动溢出
          shouldDamp = true;
          // 令 rect.bottom == maskSize.height，需要 rect.bottom 上移一段
          transY = -(rect.height + rectTop2TransYFix - dimen.height);
        }
      }
      // 未达到触发 shift img 的条件，分别向左右回弹
      if (rect.width < maskSize.width) {
        shouldDamp = true;
        transX = (1 - state.scaleRatio) * (dimen.width / 2);
      } else {
        if (rect.left + extraX > 0) {
          shouldDamp = true;
          transX = 0;
        } else if (rect.right + extraX < maskSize.width) {
          shouldDamp = true;
          // todo 右侧贴边
          transX = 0;
        }
      }

      // todo 切换前就展示下张图片


      let wannaShift = false;
      let shiftOrientation = null;
      if (rect.left > 0 && extraX < 0) {
        wannaShift = true;
        shiftOrientation = orientation.left;
      } else if (rect.right < maskSize.width && extraX > 0) {
        wannaShift = true;
        shiftOrientation = orientation.right;
      }
      if (wannaShift && this.out.tryShiftImg(shiftOrientation)) {
        return;
      }

      // todo 时间与距离生成的效果不够好，考虑引入时间戳计算时间差值
      // todo 同时利用速度决定是否切换图片
      let t = (distance(lastTwo[0].x, lastTwo[0].y, lastTwo[1].x, lastTwo[1].y) / MoveRatio / 3).toFixed(3);
      let animation = `all ${t}s linear`;
      this.out.setState({
        translateX: transX,
        translateY: transY,
        transition: shouldDamp ? 'all 400ms cubic-bezier(0.175, 0.885, 0.32, 1.275)' : animation
      });
    },
    // scale 后的正骨（误）复位效果
    scaleDamp: (target) => {
      let state = this.state;
      let maskSize = this.maskSize;
      let transX = state.translateX;
      let transY = 0;
      let dimen = imagesSizes[state.currentIndex];
      let rect = target.getBoundingClientRect();
      let shouldAdjust = false;
      // Y 轴部分 ------------------------------------- ヽ(￣▽￣)ﾉ 
      // 图片高高度大于屏幕
      if (rect.height > maskSize.height) {
        // 检测上边界
        if (rect.top > 0) {
          shouldAdjust = true;
          transY = 0 + rectTop2TransYFix;
        }
        // 检测下边界
        if (rect.bottom < maskSize.height) {
          shouldAdjust = true;
          transY = -(rect.height + rectTop2TransYFix - dimen.originHeight);
        }
      } else {
        // 图片高度小于屏幕，直接置于中部
        shouldAdjust = true;
        transY = (1 - state.scaleRatio) * (dimen.height / 2);
      }
      // X 轴部分 ------------------------------------- ヾ(๑╹◡╹)ﾉ" 
      // 图片宽度小于屏幕，需要居中
      if (rect.width < maskSize.width) {
        shouldAdjust = true;
        // 计算tip: 移动图像中心点
        transX = (1 - state.scaleRatio) * (dimen.width / 2);
      } else {
        // 宽度大于屏幕，回弹
        if (rect.left > 0) {
          shouldAdjust = true;
          transX = transX - rect.left;
        } else if (rect.right < maskSize.width) {
          shouldAdjust = true;
          transX = maskSize.width - rect.width;
        }
      }

      if (shouldAdjust) {
        this.setState({
          translateX: transX,
          translateY: transY,
          transition: 'all 400ms cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        });
      }
    }
  }

  tryShiftImg = (shiftOrientation) => {
    let allNum = imagesSizes.length;
    if (allNum === 1) {
      return;
    }
    let state = this.state;
    if (state.currentIndex === 0 && shiftOrientation === orientation.left) {
      return;
    }
    if (state.currentIndex === allNum - 1 && shiftOrientation === orientation.right) {
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
      this.imgBounding.reloadImage(this.state.currentIndex);
    });
    return true;
  }

  freeScale = (e) => {
    let one = e.touches['0'], two = e.touches['1'];
    let rect = one.target.getBoundingClientRect();
    let newRatio = distance(one.clientX, one.clientY, two.clientX, two.clientY) /
      distance(...preTouchesClientx1y1x2y2) * this.state.scaleRatio || 1;
    let newOrigin = this.relativeCoordinate((one.clientX + two.clientX) / 2, (one.clientY + two.clientY) / 2, rect);
    let posX = rect.left + rectLeft2TransXFix;
    let posY = rect.top + rectTop2TransYFix;
    this.setState({
      scaleRatio: newRatio,
      translateX: posX - (newRatio - this.state.scaleRatio) * (newOrigin.x),
      translateY: posY - (newRatio - this.state.scaleRatio) * (newOrigin.y),
      transition: '',
      enableTransformAnimation: false,
      lastAction: Actions.Free
    });
    preTouchesClientx1y1x2y2 = [one.clientX, one.clientY, two.clientX, two.clientY];
    this.recordTimer('justFreeScaled', 50);
  }

  // fixme 最后一张图片大概率双击跳动，包括限制 Y 轴移动的时候 move
  doubleClickScale = (target, clientX, clientY) => {
    // todo 检测图片长宽比、原始尺寸等问题，适当跳过某些缩放模式
    scaleModes.currentScaleMode = (scaleModes.currentScaleMode + 1) % 3;

    const getScaleRatio = (scaleMode) => {
      let dimen = imagesSizes[this.state.currentIndex];
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
    let rect = target.getBoundingClientRect();
    let newOrigin = {
      x: this.relativeCoordinate(clientX, clientY, rect).x,
      y: imagesSizes[this.state.currentIndex].height / 2,
    };
    let posX = rect.left + rectLeft2TransXFix;
    let posY = rect.top + rectTop2TransYFix;
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
      // fixme 换用 transition end 事件回调来做
      this.inertiaDamp.scaleDamp(target);
    }, 400));
  }

  endTransition = (e) => {
  }

  render() {
    return (
      <div className="mask">
        <div className="top" style={{ opacity: this.state.showTopBar ? '1' : '0' }}>
          <div className="back" onClick={this.state.showTopBar ? this.props.close : null}></div>
          <div className="index">{`${this.state.currentIndex + 1} / ${this.props.images.length}`}</div>
          <div className="download"></div>
        </div>
        <div className="images">
          {this.props.images.map((src, idx) => {

            let state = this.state;
            const matrix = `matrix(${state.scaleRatio}, 0, 0, ${state.scaleRatio}, ` +
              `${state.translateX - this.maskSize.width * idx}, ${state.translateY})`;

            return <div key={idx}><img draggable src={src} alt={`图 ${idx + 1}`} key={idx}
              style={
                Object.assign({},
                  state.currentIndex === idx ?
                    {
                      transform: matrix,
                      transition: state.transition
                    } :
                    {
                      // 旁侧图片偏移
                      transform: `matrix(1, 0, 0, 1, ${-this.maskSize.width * (state.currentIndex)}, 0)`,
                    },
                  state.enableTransformAnimation ? { transition: 'transform 400ms' } : null
                )
              }

              // 仅对于当前图片
              onTouchEnd={state.currentIndex === idx ? this.stopTouch : null}
              onTouchMove={state.currentIndex === idx ? this.touchMove : null}
              onTouchStart={state.currentIndex === idx ? this.startTouch : null}
              onTouchCancel={state.currentIndex === idx ? this.cancelTouch : null}
              onTransitionEnd={state.currentIndex === idx ? this.endTransition : null}

              // 对于所有图片
              onLoad={(e) => this.onImagesLoad(e, idx)}
              onContextMenu={(e) => { e.preventDefault() }} />
            </div>
          })}
        </div>
      </div>
    );
  }

  toggleTopBar = () => {
    if (touching) {
      return;
    }
    this.setState({
      showTopBar: !this.state.showTopBar
    });
  }

  clearTimeout = (timerKey) => {
    if (!timers[timerKey]) {
      return;
    }
    clearTimeout(timers[timerKey]);
    timers[timerKey] = null;
  }

  recordTimer = (timerKey, timeout, callback) => {
    this.clearTimeout(timerKey);
    timers[timerKey] = setTimeout(() => {
      callback ? callback.apply() : void (0);
      this.clearTimeout(timerKey);
    }, timeout);
  }

  recordPreTouchPosition = (touch) => {
    preTouchPosition = {
      x: touch.pageX,
      y: touch.pageY
    };
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
  // 由 rect.top + rectTop2TransYFix 获取实时 translateY
  getRect2TranslateFix = () => {
    let { height: maskHeight, width: maskWidth } = this.maskSize;
    let dimen = imagesSizes[this.state.currentIndex];
    rectTop2TransYFix = - (maskHeight - dimen.height) / 2;
    rectLeft2TransXFix = - (maskWidth - dimen.width) / 2;
  }

  // 由于某个事件取消了触摸
  // 1. 例如触摸过程被一个模态的弹出框打断
  // 2. 触点离开了文档窗口，而进入了浏览器的界面元素、插件或者其他外部内容区域
  // 3. 当用户产生的触点个数超过了设备支持的个数，从而导致 TouchList 中最早的 Touch 对象被取消
  cancelTouch = (e) => {
    console.log(`%cCancel touch: ${e.touches.length} left, ${e.touches.changedTouches.length} lost`, 'color: red');
    // 所有触摸点全部移除
    if (e.touches.length === 0) {
      timers.firstClickTimer = null;
    }
  }

  maskSize = {
    width: 0,
    height: 0
  }

  // 获取当前图片的位置
  imgBounding = {
    img: null,
    get rect() {
      return this.img.getBoundingClientRect();
    },
    reloadImage(index) {
      console.log(`reload image %c${index}`, 'color: orange; font-weight: bold');
      this.img = document.querySelectorAll('.images img')[index];
    }
  }

  // 绝对坐标转相对坐标，因为 transform-origin 只接受原始坐标值
  relativeCoordinate = (x, y, rect) => {
    let ratio = this.state.scaleRatio;
    let cx = (x - rect.left) / ratio;
    let cy = (y - rect.top) / ratio;
    return { x: cx, y: cy };
  }

  // fixme 更新图片位置
  updateOnResize = () => {
    let imgs = document.querySelectorAll('.images img');
    imgs.forEach((img, idx) => {
      let size = imagesSizes[idx];
      size.width = img.width;
      size.height = img.height;
    });
    this.getRect2TranslateFix();
    this.maskSize = getMaskSize();
  }

  onImagesLoad = ({ target: img }, idx) => {
    imagesSizes[idx] = {
      width: img.width,
      height: img.height,
      originWidth: img.naturalWidth,
      originHeight: img.naturalHeight
    };
    if (idx === 0) {
      this.getRect2TranslateFix();
    }
  }

  componentWillMount = () => {
    this.imgBounding.reloadImage(0);
    window.addEventListener('resize', this.updateOnResize);
  }

  componentDidMount = () => {
    this.maskSize = getMaskSize();
  }

  componentWillUnmount = () => {
    this.props.onUnmount();
    window.removeEventListener('resize', this.updateOnResize);
  }

}
/*
 * props: 传入图片的字符串（单张）或数组（多张）
 * props: 传入对象   { images: 数组, onClose: 关闭时的回调函数 }
 */
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