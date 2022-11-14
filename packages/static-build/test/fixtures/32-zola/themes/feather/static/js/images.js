// Small script to handle image resizing
var images = (function () {
	var images = {
		// find and return an array of all images in a document 
		//
		// Returns: Array<Element>
		findAllImages: function () {
			return document.querySelectorAll("IMG");
		},

		// strips away a parent `p` tag from an image which is often 
		// created when markdown is translated into HTML
		//
		// Args: Array<Element>
		// Returns: ()
		stripParagraphFromImage: function (ims) {
			ims.forEach(function (image) {
				// remove the parent element.
				// Isn't JS' DOM library a dream?
				image.parentNode.parentNode.insertBefore(image, image.parentNode);
			});
		},

		// Adjusts max-width of items so that images will not be stretched out
		//
		// Args: 
		// - `ims` - Array<Element>
		// - `minWidth` - int - the minimum width an image needs to be in order to have 100% width
		attachLoadResizeHandler: function (ims, minWidth) {
			ims.forEach(function (image) {
				image.addEventListener("load", function (e) {
					images.resizeImage(e.target, minWidth);
				});
				// call immediately in case loaded already
				if (image.complete) {
					images.resizeImage(image, minWidth);
				};
			});
		},

		//
		resizeImage: function (image, minWidth) {
			console.log(minWidth);
			if (image.naturalWidth >= minWidth) {
				image.style.width = "100%";
			}
			image.classList.add("loaded");
		}
	}

	return images;
}());