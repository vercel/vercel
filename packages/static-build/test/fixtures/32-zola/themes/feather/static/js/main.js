var app = (function(){
	app = {
		init: function() {
			// attach onload resize to images
			var im = images.findAllImages();
			var w = document.querySelector('.container').clientWidth;
			images.attachLoadResizeHandler(im, w - 100);
			images.stripParagraphFromImage(im);
		}
	}

	window.onload = function(){
		app.init();
	};

	return app;
}());