(function( window ) {
    'use strict';
    function define_library(){
        //Core library
        var Core = {};
        //Mautic Modal
        var Modal = {
            closeButton: null,
            modal: null,
            overlay: null,
            defaults: {
                className: 'fade-and-drop',
                closeButton: true,
                content: "",
                width: '600px',
                height: '480px',
                overlay: true
            }
        };
        //Mautic Form
        var Form = {
            clickEvents: []
        };
        //Mautic Profiler
        var Profiler = {};

        //global configuration
        var config = {devmode: false, debug: false};

        Profiler.startTime = function() {
            this._startTime = performance.now();
        };

        Profiler.runTime = function() {
            this._endTime = performance.now();
            this._runtime = this._endTime - this._startTime;
            if (Core.debug()) console.log('Execution time: ' + this._runtime + ' ms.');
        };

        Form.initialize = function(){
            var re = /{mauticform([^}]+)}/g, text;
            while(text = re.exec(document.body.innerHTML)) {
                var replaceText = text[0];
                var replaceArgs = {data: {}, params: ''};
                var tmpParams = [];
                text[1].trim().split(/\s+/).forEach(function (strAttribute){
                    var tmpAtr = strAttribute.split('=');
                    replaceArgs.data[tmpAtr[0]] = tmpAtr[1];
                    if (tmpAtr[0] != 'id')
                        tmpParams.push(tmpAtr[0]+'='+encodeURIComponent(tmpAtr[1]));
                });
                tmpParams.push('html=1');
                replaceArgs.params = tmpParams.join('&');
                replaceArgs.data['replace'] = replaceText;

                replaceArgs.data['style'] = typeof(replaceArgs.data['style']) == 'undefined' ? 'embed' : replaceArgs.data['style'] ;
                if (Core.debug()) console.log(replaceArgs.data['style']+' Mautic Form: '+replaceText);

                //display form accoding with style
                switch (replaceArgs.data['style'])
                {
                    case 'modal':
                        document.body.innerHTML = document.body.innerHTML.replace(replaceText,'');
                        Form.clickEvents.push(replaceArgs);
                        break;
                    case 'embed':
                    default:
                        document.body.innerHTML = document.body.innerHTML.replace(replaceText,this.createIframe(replaceArgs).outerHTML);
                        break;
                }
            }

            this.bindClickEvents();
            Profiler.runTime();
        };

        Form.bindClickEvents = function() {
            if (Core.debug()) console.log('binding modal click events');
            for(var index in Form.clickEvents) {
                var current = Form.clickEvents[index];
                document.querySelector(current.data.element).setAttribute("_mautic_form_index", index);
                document.querySelector(current.data.element).addEventListener("click", function(){
                    if (Core.debug()) console.log('add event to '+current.data.element);
                    Form.openModal(Form.clickEvents[this.getAttribute('_mautic_form_index')]);
                });
            }
        };

        Form.openModal = function(options){
            Core.openModal({
                content: Form.createIframe(options, true).outerHTML,
                width: typeof(options.data['width']) != 'undefined' ? options.data['width'] : '600px',
                height: typeof(options.data['height']) != 'undefined' ? options.data['height'] : '480px'
            });
        };

        Form.getFormLink = function(options) {
            var index = (Core.devMode()) ? 'index_dev.php' : 'index.php';
            return Core.getMauticBaseUrl() + index + '/form/' + options.data['id'] + '?' + options.params;
        };

        Form.createIframe = function(options, embed) {
            var embed = (typeof(embed) == 'undefined') ? false : true ;
            var iframe = document.createElement('iframe');
            //iframe config properties
            iframe.frameBorder = typeof(options.data['border']) != 'undefined' ? parseInt(options.data['border']) : '0' ;
            iframe.width = (embed) ? '100%' : typeof(options.data['width']) != 'undefined' ? options.data['width'] : '600px' ;
            iframe.height = (embed) ? '100%' : typeof(options.data['height']) != 'undefined' ? options.data['height'] : '400px' ;
            iframe.className = (typeof(options.data['class']) == 'string') ? options.data['class'] : '' ;
            iframe.src = this.getFormLink(options);

            return iframe;
        };

        Form.customCallbackHandler = function(formId, event, data) {
            if (typeof MauticFormCallback !== 'undefined' &&
                typeof MauticFormCallback[formId] !== 'undefined' &&
                typeof MauticFormCallback[formId][event] == 'function'
            ) {
                if (typeof data == 'undefined') {
                    data = null;
                }
                MauticFormCallback[formId][event](data);
            }
        };

        Form.validator = function(formId) {
            var validator = {
                validateForm: function () {
                    Form.customCallbackHandler(formId, 'onValidateStart');

                    validator.disableSubmitButton();

                    // Remove success class if applicable
                    var formContainer = document.getElementById('mauticform_wrapper_' + formId);
                    if (formContainer) {
                        formContainer.className = formContainer.className.replace(" mauticform-post-success", "");
                    }

                    validator.setMessage('', 'message');
                    validator.setMessage('', 'error');

                    var formValid = true;

                    function validateOptions(elOptions) {
                        var optionsValid = false;

                        if (elOptions.length == undefined) {
                            elOptions = [elOptions];
                        }

                        for (var i = 0; i < elOptions.length; i++) {
                            if (elOptions[i].checked) {
                                optionsValid = true;
                                break;
                            }
                        }

                        return optionsValid;
                    }

                    function validateEmail(email) {
                        var atpos = email.indexOf("@");
                        var dotpos = email.lastIndexOf(".");
                        var valid = (atpos < 1 || dotpos < atpos + 2 || dotpos + 2 >= email.length) ? false : true;
                        return valid;
                    }

                    var elId   = 'mauticform_' + formId;
                    var elForm = document.getElementById(elId);

                    // Find each required element
                    for (var fieldKey in MauticFormValidations[formId]) {
                        var field = MauticFormValidations[formId][fieldKey];
                        var name  = 'mauticform[' + field.name + ']';
                        switch (field.type) {
                            case 'radiogrp':
                            case 'checkboxgrp':
                                var elOptions = elForm.elements[name];
                                var valid = validateOptions(elOptions);
                                break;

                            case 'email':
                                var valid = validateEmail(elForm.elements[name].value);
                                break;

                            default:
                                var valid = (elForm.elements[name].value != '')
                                break;
                        }

                        if (!valid) {
                            validator.markError('mauticform_' + fieldKey, valid);
                            formValid = false;

                            validator.enableSubmitButton();
                        } else {
                            validator.clearError('mauticform_' + fieldKey);
                        }
                    }

                    if (formValid) {
                        document.getElementById(elId + '_return').value = document.URL;
                    }

                    Form.customCallbackHandler(formId, 'onValidateEnd', formValid);

                    return formValid;
                },

                markError: function(containerId, valid, validationMessage) {
                    var elContainer = document.getElementById(containerId);
                    if (elContainer) {
                        var elErrorSpan = elContainer.querySelector('.mauticform-errormsg');
                        if (elErrorSpan) {
                            if (typeof validationMessage !== 'undefined') {
                                elErrorSpan.innerHTML = validationMessage;
                            }

                            elErrorSpan.style.display = (valid) ? 'none' : '';
                            elContainer.className = elContainer.className + " mauticform-has-error";
                        }
                    }
                },

                clearErrors: function() {
                    var elForm    = document.getElementById('mauticform_' + formId);
                    var hasErrors = elForm.querySelectorAll('.mauticform-has-error');
                    var that      = this;
                    [].forEach.call(hasErrors, function(container) {
                        that.clearError(container.id);
                    });
                },

                clearError: function(containerId) {
                    var elContainer = document.getElementById(containerId);
                    if (elContainer) {
                        var elErrorSpan = elContainer.querySelector('.mauticform-errormsg');
                        if (elErrorSpan) {
                            elErrorSpan.style.display = 'none';
                            elContainer.className = elContainer.className.replace(" mauticform-has-error", "");
                        }
                    }
                },

                parseFormResponse: function (response) {
                    Form.customCallbackHandler(formId, 'onResponse', response);

                    if (response.download) {
                        // Hit the download in the iframe
                        document.getElementById('mauticiframe_' + formId).src = response.download;

                        // Register a callback for a redirect
                        if (response.redirect) {
                            setTimeout(function () {
                                window.location = response.redirect;
                            }, 2000);
                        }
                    } else if (response.redirect) {
                        window.location = response.redirect;
                    } else if (response.validationErrors) {
                        for (var field in response.validationErrors) {
                            this.markError('mauticform_' + field, false, response.validationErrors[field]);
                        }
                    } else if (response.errorMessage) {
                        this.setMessage(response.errorMessage, 'error');
                    }
;
                    if (response.success) {
                        if (response.successMessage) {
                            this.setMessage(response.successMessage, 'message');
                        }

                        // Add a post success class
                        var formContainer = document.getElementById('mauticform_wrapper_' + formId);
                        if (formContainer) {
                            formContainer.className = formContainer.className + " mauticform-post-success";
                        }

                        // Reset the form
                        this.resetForm();
                    }

                    validator.enableSubmitButton();
                },

                setMessage: function (message, type) {
                    var container = document.getElementById('mauticform_' + formId + '_' + type);
                    if (container) {
                        container.innerHTML = message;
                    } else if (message) {
                        alert(message);
                    }
                },

                resetForm: function () {
                    this.clearErrors();

                    document.getElementById('mauticform_' + formId).reset();
                },

                disableSubmitButton: function() {
                    var submitButton = document.getElementById('mauticform_' + formId).querySelector('.mauticform-button');
                    if(submitButton) {
                        MauticLang.submitMessage = submitButton.innerHTML;
                        submitButton.innerHTML   = MauticLang.submittingMessage;
                        submitButton.disabled    = 'disabled';
                    }
                },

                enableSubmitButton: function() {
                    var submitButton = document.getElementById('mauticform_' + formId).querySelector('.mauticform-button');
                    if(submitButton) {
                        submitButton.innerHTML = MauticLang.submitMessage;
                        submitButton.disabled  = '';
                    }
                }
            };

            return validator;
        };

        Form.registerFormMessenger = function() {
            window.addEventListener('message', function(event) {
                if (Core.debug()) console.log(event);

                if(event.origin !== MauticDomain) return;

                try {
                    var response = JSON.parse(event.data);
                    if (response && response.formName) {
                        Core.getValidator(response.formName).parseFormResponse(response);
                    }
                } catch (err) {
                    if (Core.debug()) console.log(err);
                }
            }, false);

            if (Core.debug()) console.log('Messenger listener started.');
        };

        Core.getValidator = function(formId) {
            return Form.validator(formId);
        };

        Core.validateForm = function(formId) {
            return Core.getValidator(formId).validateForm();
        };

        Modal.loadStyle = function() {
            if (typeof(config.modal_css) != 'undefined' && parseInt(config.modal_css) != 'Nan' && config.modal_css == 0) {
                if (Core.debug()) console.log('custom modal css style');
                return;
            }

            var s = document.createElement('link');
            s.rel = "stylesheet"
            s.type = "text/css"
            s.href = Core.debug() ? Core.getMauticBaseUrl() + 'media/css/modal.css' : Core.getMauticBaseUrl() + 'media/css/modal.min.css';
            document.head.appendChild(s);
            if (Core.debug()) console.log(s);
        };

        Modal.open = function() {
            if (arguments[0] && typeof arguments[0] === "object") {
                this.options = this.extendDefaults(this.defaults, arguments[0]);
            }
            this.buildOut();
            this.initializeEvents();
            window.getComputedStyle(this.modal).height;
            this.modal.className = this.modal.className + (this.modal.offsetHeight > window.innerHeight ? " mauticForm-open mauticForm-anchored" : " mauticForm-open");
            this.overlay.className = this.overlay.className + " mauticForm-open";
        };

        Modal.buildOut = function() {
            var content, contentHolder, docFrag;
            content = typeof(this.options.content) == 'string' ? this.options.content : this.options.content.innerHTML;
            // Create a DocumentFragment to build with
            docFrag = document.createDocumentFragment();

            // Create modal element
            this.modal = document.createElement("div");
            this.modal.className = "mauticForm-modal " + this.options.className;
            this.modal.style.width = this.options.width;
            this.modal.style.height = this.options.height;

            // If closeButton option is true, add a close button
            if (this.options.closeButton === true) {
                this.closeButton = document.createElement("button");
                this.closeButton.className = "mauticForm-close close-button";
                this.closeButton.innerHTML = "&times;";
                this.modal.appendChild(this.closeButton);
            }

            // If overlay is true, add one
            if (this.options.overlay === true) {
                this.overlay = document.createElement("div");
                this.overlay.className = "mauticForm-overlay " + this.options.className;
                docFrag.appendChild(this.overlay);
            }

            // Create content area and append to modal
            contentHolder = document.createElement("div");
            contentHolder.className = "mauticForm-content";
            contentHolder.innerHTML = content;
            this.modal.appendChild(contentHolder);

            // Append modal to DocumentFragment
            docFrag.appendChild(this.modal);

            // Append DocumentFragment to body
            document.body.appendChild(docFrag);
        };

        Modal.extendDefaults = function(source, properties) {
            for (var property in properties) {
                if (properties.hasOwnProperty(property)) source[property] = properties[property];
            }
            return source;
        };

        Modal.initializeEvents = function() {
            if (this.closeButton) this.closeButton.addEventListener('click', this.close.bind(this));
            if (this.overlay) this.overlay.addEventListener('click', this.close.bind(this));
        };

        Modal.transitionSelect = function() {
            var el = document.createElement("div");
            return (el.style.WebkitTransition) ? "webkitTransitionEnd" : (el.style.WebkitTransition) ? "webkitTransitionEnd" : "oTransitionEnd" ;
        };

        Modal.close = function() {
            var _ = this;
            this.modal.className = this.modal.className.replace(" mauticForm-open", "");
            this.overlay.className = this.overlay.className.replace(" mauticForm-open", "");
            this.modal.addEventListener(this.transitionSelect(), function() {
                _.modal.parentNode.removeChild(_.modal);
            });
            this.overlay.addEventListener(this.transitionSelect(), function() {
                if(_.overlay.parentNode) _.overlay.parentNode.removeChild(_.overlay);
            });

            //remove modal and overlay
            this.overlay.parentNode.removeChild(this.overlay);
            this.modal.parentNode.removeChild(this.modal);
        };

        Core.parseToObject = function(params) {
            return JSON.parse('{"' + decodeURI(params.trim().replace(/&/g, "\",\"").replace(/=/g,"\":\"")) + '"}');
        };

        Core.setConfig = function (options) {
            config = options;
        };

        Core.getConfig = function() {
            return config;
        };

        Core.debug = function() {
            return (typeof(config.debug) != 'undefined' && parseInt(config.debug) != 'Nan' && config.debug == 1) ? true : false ;
        };

        Core.devMode = function() {
            return (typeof(config.devmode) != 'undefined' && parseInt(config.devmode) != 'Nan' && config.devmode == 1) ? true : false ;
        };

        Core.setMauticBaseUrl = function(base_url) {
            config.mautic_base_url = base_url.split('/').slice(0,-3).join('/')+'/';
        };

        Core.getMauticBaseUrl = function() {
            return config.mautic_base_url;
        };

        Core.initialize = function(base_url) {
            Profiler.startTime();
            if (Core.debug()) console.log('SDK initialized');
            if (typeof(config.mautic_base_url) == 'undefined') Core.setMauticBaseUrl(base_url);
            if (Core.debug()) console.log('Automatic setup mautic_base_url as: ' + config.mautic_base_url);
            Modal.loadStyle();
            document.addEventListener("DOMContentLoaded", function(e){
                if (Core.debug()) console.log('DOM is ready');
                Form.initialize();
            });
        };

        Core.openModal = function(options){
            Modal.open(options);
        };

        Core.onLoad = function() {
            Form.registerFormMessenger();
        };

        return Core;
    }

    if (typeof(MauticSDK) === 'undefined') {
        window.MauticSDK = define_library();
        var sjs = document.getElementsByTagName('script'), tjs = sjs.length;
        for (var i = 0; i < sjs.length; i++) {
            if (!sjs[i].hasAttribute('src') || sjs[i].getAttribute("src").indexOf('mautic-form-src.js') == -1) continue;
            var sParts = sjs[i].getAttribute("src").split("?");
            if (sParts[1]) MauticSDK.setConfig(MauticSDK.parseToObject(sParts[1]));
            MauticSDK.initialize(sParts[0]);
            break;
        }
    }
})( window );