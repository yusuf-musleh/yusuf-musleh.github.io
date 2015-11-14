$(document).ready(function(){
   	$(".bg").interactive_bg({
   		strength: 25,
        scale: 1,
  		contain: false
 	});

   	// Initialize size of logo
	if($(window).outerWidth() < 768){

		$(".bg > .ibg-bg").css({
			'width': '300px',
			'height': '200px',
			'margin': '0 auto'
		})
	}
	else{
		$(".bg > .ibg-bg").css({
			'width': '400px',
			'height': '300px',
			'margin': '0 auto'
		})
	}

});

// changing size of logo responsively
$(window).resize(function() {

	if($(window).outerWidth() < 768){

		$(".bg > .ibg-bg").css({
			'width': '300px',
			'height': '200px',
			'margin': '0 auto'
		})
	}
	else{
		$(".bg > .ibg-bg").css({
			'width': '400px',
			'height': '300px',
			'margin': '0 auto'
		})
	}


})

