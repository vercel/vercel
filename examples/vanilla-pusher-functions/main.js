'use strict';

(function() {
  let canvas = document.querySelector('.whiteboard');
  let colors = document.querySelectorAll('.color');
  let context = canvas.getContext('2d');

  let pusher = new Pusher('2a81e2e82be1a9d76433', {
    cluster: 'us2',
  });
  let channel = pusher.subscribe('drawing-events');

  channel.bind('drawing', onDrawingEvent);

  let current = {
    color: 'black',
  };

  let drawing = false;

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  canvas.addEventListener('mousedown', onMouseDown, false);
  canvas.addEventListener('mouseup', onMouseUp, false);
  canvas.addEventListener('mouseout', onMouseUp, false);
  canvas.addEventListener('mousemove', throttle(onMouseMove, 10), false);

  canvas.addEventListener('touchstart', onMouseDown, false);
  canvas.addEventListener('touchend', onMouseUp, false);
  canvas.addEventListener('touchcancel', onMouseUp, false);
  canvas.addEventListener('touchmove', throttle(onMouseMove, 10), false);

  for (var i = 0; i < colors.length; i++) {
    colors[i].addEventListener('click', updateColor, false);
  }

  function drawLine(x0, x1, y0, y1, color, emit) {
    context.beginPath();
    context.moveTo(x0, y0);
    context.lineTo(x1, y1);
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.stroke();
    context.closePath();

    if (!emit) {
      return;
    }

    let w = canvas.width;
    let h = canvas.height;

    pushDrawData({
      x0: x0 / w,
      x1: x1 / w,
      y0: y0 / h,
      y1: y1 / h,
      color,
    });
  }

  function onMouseDown(e) {
    drawing = true;
    current.x = e.clientX || e.touches[0].clientX;
    current.y = e.clientY || e.toches[0].clientY;
  }

  function onMouseUp(e) {
    if (!drawing) {
      return;
    }
    drawing = false;
    drawLine(
      current.x,
      e.clientX || e.touches[0].clientX,
      current.y,
      e.clientY || e.touches[0].clientY,
      current.color,
      true
    );
  }

  function onMouseMove(e) {
    if (!drawing) {
      return;
    }
    drawLine(
      current.x,
      e.clientX || e.touches[0].clientX,
      current.y,
      e.clientY || e.touches[0].clientY,
      current.color,
      true
    );
    current.x = e.clientX || e.touches[0].clientX;
    current.y = e.clientY || e.touches[0].clientY;
  }

  function throttle(callback, delay) {
    let previousCall = Date.now();
    return function() {
      let time = Date.now();

      if (time - previousCall >= delay) {
        previousCall = time;
        callback.apply(null, arguments);
      }
    };
  }

  function updateColor(e) {
    pushDrawData();
    current.color = e.target.className.split(' ')[1];
  }

  function onDrawingEvent({ x0, x1, y0, y1, color }) {
    let w = canvas.width;
    let h = canvas.height;
    drawLine(x0 * w, x1 * w, y0 * h, y1 * h, color);
  }

  function onResize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  async function pushDrawData(data) {
    const res = await fetch('/api/push-draw-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      console.error('event not sent');
    }
  }
})();
