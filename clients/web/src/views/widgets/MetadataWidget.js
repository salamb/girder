/**
 * This widget shows a list of metadata in a given item.
 */
girder.views.MetadataWidget = girder.View.extend({
    events: {
        'click .g-add-json-metadata': function (event) {
            this.addMetadata(event, 'json');
        },
        'click .g-add-simple-metadata': function (event) {
            this.addMetadata(event, 'simple');
        }
    },

    /**
     * Creates a widget to display and optionally edit metadata fields.
     *
     * @param settings.item {girder.Model} The model object whose metadata to display.
     *    Can be any model type that inherits girder.models.MetadataMixin.
     * @param [settings.fieldName='meta'] {string} The name of the model attribute
     *    to display/edit. The model attribute with this name should be an object
     *    whose top level keys represent metadata keys.
     * @param [settings.title='Metadata'] {string} Title for the widget.
     * @param [settings.apiPath] {string} The relative API path to use when editing
     *    metadata keys for this model. Defaults to using the MetadataMixin default path.
     * @param [settings.accessLevel=girder.AccessType.READ] {girder.AccessType} The
     *    access level for this widget. Use READ for read-only, or WRITE (or greater)
     *    for adding editing capabilities as well.
     * @param [settings.onMetadataAdded] {Function} A custom callback for when a
     *    new metadata key is added to the list. If passed, will override the
     *    default behavior of calling MetadataMixin.addMetadata.
     * @param [settings.onMetadataEdited] {Function} A custom callback for when an
     *    existing metadata key is updated. If passed, will override the default
     *    behavior of calling MetadataMixin.editMetadata.
     */
    initialize: function (settings) {
        this.item = settings.item;
        this.fieldName = settings.fieldName || 'meta';
        this.title = settings.title || 'Metadata';
        this.apiPath = settings.apiPath;
        this.accessLevel = settings.accessLevel;
        this.onMetadataEdited = settings.onMetadataEdited;
        this.onMetadataAdded = settings.onMetadataAdded;

        this.item.on('g:changed', function () {
            this.render();
        }, this);
        this.render();
    },

    modes: {
        simple: {
            editor: function (args) {
                return new girder.views.MetadatumEditWidget(args);
            },
            displayValue: function () {
                return this.value;
            },
            template: girder.templates.metadatumView
        },
        json: {
            editor: function (args) {
                if (args.value !== undefined) {
                    args.value = JSON.parse(args.value);
                }
                return new girder.views.JsonMetadatumEditWidget(args);
            },
            displayValue: function () {
                return JSON.stringify(this.value, null, 4);
            },
            validation: {
                from: {
                    simple: [
                        function (value) {
                            try {
                                JSON.parse(value);
                                return true;
                            } catch (e) {}

                            return false;
                        },
                        'The simple field is not valid JSON and can not be converted.'
                    ]
                }
            },
            template: girder.templates.jsonMetadatumView
        }
    },

    setItem: function (item) {
        this.item = item;
        return this;
    },

    // Does not support modal editing
    getModeFromValue: function (value) {
        return _.isString(value) ? 'simple' : 'json';
    },

    addMetadata: function (event, mode) {
        var EditWidget = this.modes[mode].editor;
        var newRow = $('<div>').attr({
            class: 'g-widget-metadata-row editing'
        }).appendTo(this.$el.find('.g-widget-metadata-container'));
        var value = (mode === 'json') ? '{}' : '';

        var widget = new girder.views.MetadatumWidget({
            el: newRow,
            mode: mode,
            key: '',
            value: value,
            item: this.item,
            fieldName: this.fieldName,
            apiPath: this.apiPath,
            accessLevel: this.accessLevel,
            girder: girder,
            parentView: this,
            onMetadataEdited: this.onMetadataEdited,
            onMetadataAdded: this.onMetadataAdded
        });

        var newEditRow = $('<div>').appendTo(widget.$el);

        new EditWidget({
            el: newEditRow,
            item: this.item,
            key: '',
            value: value,
            fieldName: this.fieldName,
            apiPath: this.apiPath,
            accessLevel: this.accessLevel,
            newDatum: true,
            parentView: widget,
            onMetadataEdited: this.onMetadataEdited,
            onMetadataAdded: this.onMetadataAdded
        }).render();
    },

    render: function () {
        var metaDict = this.item.get(this.fieldName) || {};
        var metaKeys = Object.keys(metaDict);
        metaKeys.sort(girder.localeSort);

        // Metadata header
        this.$el.html(girder.templates.metadataWidget({
            item: this.item,
            title: this.title,
            accessLevel: this.accessLevel,
            girder: girder
        }));

        // Append each metadatum
        _.each(metaKeys, function (metaKey) {
            this.$el.find('.g-widget-metadata-container').append(new girder.views.MetadatumWidget({
                mode: this.getModeFromValue(metaDict[metaKey]),
                key: metaKey,
                value: metaDict[metaKey],
                accessLevel: this.accessLevel,
                girder: girder,
                parentView: this,
                fieldName: this.fieldName,
                apiPath: this.apiPath,
                onMetadataEdited: this.onMetadataEdited,
                onMetadataAdded: this.onMetadataAdded
            }).render().$el);
        }, this);

        this.$('.g-widget-metadata-add-button').tooltip({
            container: this.$el,
            placement: 'left',
            animation: false,
            delay: {show: 100}
        });

        return this;
    }
});

girder.views.MetadatumWidget = girder.View.extend({
    events: {
        'click .g-widget-metadata-edit-button': 'editMetadata'
    },

    initialize: function (settings) {
        if (!_.has(this.parentView.modes, settings.mode)) {
            throw 'Unsupported metadatum mode ' + settings.mode + ' detected.';
        }

        this.mode = settings.mode;
        this.key = settings.key;
        this.value = settings.value;
        this.accessLevel = settings.accessLevel;
        this.parentView = settings.parentView;
        this.fieldName = settings.fieldName;
        this.apiPath = settings.apiPath;
        this.onMetadataEdited = settings.onMetadataEdited;
        this.onMetadataAdded = settings.onMetadataAdded;
    },

    _validate: function (from, to, value) {
        var newMode = this.parentView.modes[to];

        if (_.has(newMode, 'validation') &&
            _.has(newMode.validation, 'from') &&
            _.has(newMode.validation.from, from)) {
            var validate = newMode.validation.from[from][0];
            var msg = newMode.validation.from[from][1];

            if (!validate(value)) {
                girder.events.trigger('g:alert', {
                    text: msg,
                    type: 'warning'
                });
                return false;
            }
        }

        return true;
    },

    // @todo too much duplication with editMetadata
    toggleEditor: function (event, newEditorMode, existingEditor, overrides) {
        var fromEditorMode =
                (existingEditor instanceof girder.views.JsonMetadatumEditWidget)
                    ? 'json' : 'simple';
        var newValue = (overrides || {}).value || existingEditor.$el.attr('g-value');
        if (!this._validate(fromEditorMode, newEditorMode, newValue)) {
            return;
        }

        var row = existingEditor.$el;
        existingEditor.destroy();
        row.addClass('editing').empty();

        var opts = _.extend({
            el: row,
            item: this.parentView.item,
            key: row.attr('g-key'),
            value: row.attr('g-value'),
            accessLevel: this.accessLevel,
            newDatum: false,
            parentView: this,
            fieldName: this.fieldName,
            apiPath: this.apiPath,
            onMetadataEdited: this.onMetadataEdited,
            onMetadataAdded: this.onMetadataAdded
        }, overrides || {});

        this.parentView.modes[newEditorMode].editor(opts).render();
    },

    editMetadata: function (event) {
        var row = $(event.currentTarget.parentElement);
        row.addClass('editing').empty();

        var newEditRow = row.append('<div></div>');

        var opts = {
            el: newEditRow.find('div'),
            item: this.parentView.item,
            key: row.attr('g-key'),
            value: row.attr('g-value'),
            accessLevel: this.accessLevel,
            newDatum: false,
            parentView: this,
            fieldName: this.fieldName,
            apiPath: this.apiPath,
            onMetadataEdited: this.onMetadataEdited,
            onMetadataAdded: this.onMetadataAdded
        };

        // If they're trying to open false, null, 6, etc which are not stored as strings
        if (this.mode === 'json') {
            try {
                var jsonValue = JSON.parse(row.attr('g-value'));

                if (jsonValue !== undefined && !_.isObject(jsonValue)) {
                    opts.value = jsonValue;
                }
            } catch (e) {}
        }

        this.parentView.modes[this.mode].editor(opts).render();
    },

    render: function () {
        this.$el.attr({
            class: 'g-widget-metadata-row',
            'g-key': this.key,
            'g-value': _.bind(this.parentView.modes[this.mode].displayValue, this)()
        }).empty();

        this.$el.html(this.parentView.modes[this.mode].template({
            key: this.key,
            value: _.bind(this.parentView.modes[this.mode].displayValue, this)(),
            accessLevel: this.accessLevel,
            girder: girder
        }));

        return this;
    }
});

girder.views.MetadatumEditWidget = girder.View.extend({
    events: {
        'click .g-widget-metadata-cancel-button': 'cancelEdit',
        'click .g-widget-metadata-save-button': 'save',
        'click .g-widget-metadata-delete-button': 'deleteMetadatum',
        'click .g-widget-metadata-toggle-button': function (event) {
            var editorType;
            // @todo modal
            // in the future this event will have the new editorType (assuming a dropdown)
            if (this instanceof girder.views.JsonMetadatumEditWidget) {
                editorType = 'simple';
            } else {
                editorType = 'json';
            }

            this.parentView.toggleEditor(event, editorType, this, {
                // Save state before toggling editor
                key: this.$el.find('.g-widget-metadata-key-input').val(),
                value: this.getCurrentValue()
            });
        }
    },

    initialize: function (settings) {
        this.item = settings.item;
        this.key = settings.key || '';
        this.fieldName = settings.fieldName || 'meta';
        this.value = (settings.value !== undefined) ? settings.value : '';
        this.accessLevel = settings.accessLevel;
        this.newDatum = settings.newDatum;
        this.fieldName = settings.fieldName;
        this.apiPath = settings.apiPath;
        this.onMetadataEdited = settings.onMetadataEdited;
        this.onMetadataAdded = settings.onMetadataAdded;
    },

    editTemplate: girder.templates.metadatumEditWidget,

    getCurrentValue: function () {
        return this.$el.find('.g-widget-metadata-value-input').val();
    },

    deleteMetadatum: function (event) {
        event.stopImmediatePropagation();
        var metadataList = $(event.currentTarget.parentElement).parent();
        var params = {
            text: 'Are you sure you want to delete the metadatum <b>' +
                _.escape(this.key) + '</b>?',
            escapedHtml: true,
            yesText: 'Delete',
            confirmCallback: _.bind(function () {
                this.item.removeMetadata(this.key, function () {
                    metadataList.remove();
                }, null, {
                    field: this.fieldName,
                    path: this.apiPath
                });
            }, this)
        };
        girder.confirm(params);
    },

    cancelEdit: function (event) {
        event.stopImmediatePropagation();
        var curRow = $(event.currentTarget.parentElement).parent();
        if (this.newDatum) {
            curRow.remove();
        } else {
            this.parentView.render();
        }
    },

    save: function (event, value) {
        event.stopImmediatePropagation();
        var curRow = $(event.currentTarget.parentElement),
            tempKey = curRow.find('.g-widget-metadata-key-input').val(),
            tempValue = (value !== undefined) ? value : curRow.find('.g-widget-metadata-value-input').val();

        if (this.newDatum && tempKey === '') {
            girder.events.trigger('g:alert', {
                text: 'A key is required for all metadata.',
                type: 'warning'
            });
            return;
        }

        var saveCallback = _.bind(function () {
            this.key = tempKey;
            this.value = tempValue;

            this.parentView.key = this.key;
            this.parentView.value = this.value;

            if (this instanceof girder.views.JsonMetadatumEditWidget) {
                this.parentView.mode = 'json';
            } else {
                this.parentView.mode = 'simple';
            }

            this.parentView.render();

            this.newDatum = false;
        }, this);

        var errorCallback = function (out) {
            girder.events.trigger('g:alert', {
                text: out.message,
                type: 'danger'
            });
        };

        if (this.newDatum) {
            if (this.onMetadataAdded) {
                this.onMetadataAdded(tempKey, tempValue, saveCallback, errorCallback);
            } else {
                this.item.addMetadata(tempKey, tempValue, saveCallback, errorCallback, {
                    field: this.fieldName,
                    path: this.apiPath
                });
            }
        } else {
            if (this.onMetadataEdited) {
                this.onMetadataEdited(tempKey, this.key, tempValue, saveCallback, errorCallback);
            } else {
                this.item.editMetadata(tempKey, this.key, tempValue, saveCallback, errorCallback, {
                    field: this.fieldName,
                    path: this.apiPath
                });
            }
        }
    },

    render: function () {
        this.$el.html(this.editTemplate({
            item: this.item,
            key: this.key,
            value: this.value,
            accessLevel: this.accessLevel,
            newDatum: this.newDatum,
            girder: girder
        }));
        this.$el.find('.g-widget-metadata-key-input').focus();

        this.$('[title]').tooltip({
            container: this.$el,
            placement: 'bottom',
            animation: false,
            delay: {show: 100}
        });

        return this;
    }
});

girder.views.JsonMetadatumEditWidget = girder.views.MetadatumEditWidget.extend({
    editTemplate: girder.templates.jsonMetadatumEditWidget,

    getCurrentValue: function () {
        return this.editor.getText();
    },

    save: function (event) {
        try {
            girder.views.MetadatumEditWidget.prototype.save.call(
                this, event, this.editor.get());
        } catch (err) {
            girder.events.trigger('g:alert', {
                text: 'The field contains invalid JSON and can not be saved.',
                type: 'warning'
            });
        }
    },

    render: function () {
        girder.views.MetadatumEditWidget.prototype.render.apply(this, arguments);

        this.editor = new JSONEditor(this.$el.find('.g-json-editor')[0], {
            mode: 'tree',
            modes: ['code', 'tree'],
            error: function () {
                girder.events.trigger('g:alert', {
                    text: 'The field contains invalid JSON and can not be viewed in Tree Mode.',
                    type: 'warning'
                });
            }
        });

        if (this.value !== undefined) {
            this.editor.setText(JSON.stringify(this.value));
            this.editor.expandAll();
        }

        return this;
    }
});
