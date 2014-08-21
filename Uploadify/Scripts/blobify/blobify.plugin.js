(function ($) {

    var totalUploadedBlocks, totalNumberOfBlocks = 0;
    var settings;

    $.fn.blobify = function (options) {

        // Default values
        var defaults = {
            accountName: "[StorageAccountName]",
            templatesLocation: "blobify.templates.js",
            sasEndpoint: "/api/blob/obtainsas"
        }

        settings = $.extend(defaults, options);

        // Create the invisible template holder div
        $("body").prepend('<div id="blobify-template-holder" style="display:none"></div>');

        // And load the templates
        $("#blobify-template-holder").load(settings.templatesLocation, $.injectTemplates.bind(this));

        return this.each;
    };

    $.injectTemplates = function () {
        this.each(function () {
            // Assign current element to variable, in this case is an input element
            var input = $(this);
            var template = input.data("template");


            // Determine the template
            if (template == undefined)
                template = "default-template";

            // Load the template
            var templateSource = $("#blobify-template-holder").find("#" + template).html();
            if (templateSource != undefined) {
                // Compile the template
                var templateCompiled = Handlebars.compile(templateSource);

                // Add context to the template
                var context = {};
                var appliedTemplate = jQuery(templateCompiled(context));

                // Hide the input field (better yet, hide them by default)
                input.hide();
                
                // Wrap the input field in a container div
                input.wrapAll('<div class="blobify-container"></div>');

                // Inject the template in the container div
                input.parent().append(appliedTemplate);

                // Attach the click handler on the Browse button
                input.parent().find("a[role='browse-button']").click(function () { $(this).closest(".blobify-container").find("input.blobify").click() });

                // Attach click handler to Upload button
                input.parent().find("a[role='upload-button']").click($.initializeUpload);

                // Attach the change handler on the input field
                input.change(function () {
                    // Set the filename (if found on the template)
                    var files = input[0].files; // FileList object. input[0] will get us the DOM object from the jQuery object
                    input.parent().find("span[role='filename']").html(files[0].name);

                    // Enable the upload button
                    input.parent().find("a[role='upload-button']").removeClass("disabled");
                });

            }
        });
    };

    $.initializeUpload = function (e) {
        var parent = $(e.target).closest(".blobify-container");
        var input = parent.find("input.blobify");
        var targetContainer = input.data("container");


        totalUploadedBlocks = 0;
        totalNumberOfBlocks = 0;
        // assert the browser support html5
        if (!(window.File && window.Blob && window.FormData)) {
            alert("Please use a modern browser that supports the HTML5 File feature.");
            return;
        }

        var files = input[0].files; // FileList object. input[0] will get us the DOM object from the jQuery object
        var fileName = escape(files[0].name);

        $.disableControlsForUpload(parent);

        // Retrieve an upload destination that will include a SAS, then begin upload
        $.obtainSAS(targetContainer,fileName,parent,$.beginUpload);
    }

    $.obtainSAS = function (containerName,blobName,parent,callback) {
        $.get(settings.sasEndpoint + "?containerName=" + containerName + "&blobName=" + blobName, function (response) {
            if (!response.sas) {
                alert("There was an error obtaining the token required to upload.");
            }
            else {
                callback(parent,response);
            }
        });
    }

    $.beginUpload = function(parent,sasResponse) {
        var input = parent.find("input.blobify");

        // We will support only a single file upload
        var file = input[0].files[0];
        if (file != undefined) {

        }
    }

    $.disableControlsForUpload = function (parent) {
        parent.find("a[role='upload-button']").addClass("disabled");
        parent.find("a[role='browse-button']").addClass("disabled");
    }

}(jQuery));

