﻿/// <reference path="../include/interfaces.d.ts" />
/// <reference path="FullCustomCommand.ts" />
/// <reference path="BasePage.ts" />
module Garage {
	export module View {

		import Framework = CDP.Framework;
		import UI = CDP.UI;
		import Tools = CDP.Tools;
		import JQUtils = Util.JQueryUtils;

		var TAG: string = "[Garage.View.FullCustom] ";
		var HUIS_FILES_DIRECTORY = "app/res/samples/materials";

		interface TargetModel {
			type: string;
			button?: Model.ButtonItem;
			image?: Model.ImageItem;
			label?: Model.LabelItem;
		}

		interface IActionList {
			touch: string;
			touch_top: string;
			touch_bottom: string;
			touch_right: string;
			touch_left: string;
			long_press: string;
			swipe_up: string;
			swipe_down: string;
			swipe_right: string;
			swipe_left: string;
			ring_right: string;
			ring_left: string;
		}

		interface IStateDetail extends IGState {
			actionList?: IActionList;
			actionListTranslate?: IActionList;
		}


		/**
		 * @class FullCustom
		 * @brief FullCustom View class for Garage.
		 */
		class FullCustom extends BasePage {
			private FILE_NAME = "FullCustom.ts";
			private faceRenderer_pallet_: FaceRenderer;
			private faceRenderer_canvas_: FaceRenderer;

			private templateFullCustomFile_: string;
			private templateItemDetailFile_: string;
			private itemResizerTemplate_: Tools.JST;
			private newRemote_: boolean; //<! リモコン新規作成かどうか

			private faceListScrollLeft_: number;
			private faceListTotalWidth_: number;
			private faceListContainerWidth_: number;

			private commandManager_: CommandManager;
			private $currentTarget_: JQuery;
			private currentTargetModel_: TargetModel;
			private currentTargetPageIndex_: number;
			private currentTargetButtonStates_: IStateDetail[];
			private currentTargetButtonStatesUpdated_: boolean;
			private selectedResizer_: string;
			private mouseMoveStartTargetPosition_: IPosition;
			private mouseMoveStartPosition_: IPosition;
			private mouseMoveStartTargetArea_: IArea;
			private mouseMoving_: boolean;
			private gridSize_: number;
            private isTextBoxFocused: Boolean;

            private bindedLayoutPage = null;

            
			/**
			 * construnctor
			 */
			constructor() {
				super("/templates/full-custom.html", "page-full-custom", { route: "full-custom" });
			}

			///////////////////////////////////////////////////////////////////////
			// Override: UI.PageView

			//! page initialization event
			onInitialize(event: JQueryEventObject): void {
				super.onInitialize(event);

				this.faceListScrollLeft_ = 0;
				this.faceListTotalWidth_ = 0;
				this.faceListContainerWidth_ = 0;
                this.gridSize_ = DEFAULT_GRID;
				
			}

			onPageShow(event: JQueryEventObject, data?: Framework.ShowEventData) {
				requirejs(["garage.view.fullcustomcommand"], () => {

					super.onPageShow(event, data);

					this.newRemote_ = false;

					this.templateFullCustomFile_ = Framework.toUrl("/templates/full-custom.html");
					this.templateItemDetailFile_ = Framework.toUrl("/templates/item-detail.html");

					this._pageLayout();
					this._listupFaces();
					var remoteId = this._getUrlQueryParameter("remoteId");
					this._renderCanvas(remoteId);

					this.itemResizerTemplate_ = Tools.Template.getJST("#template-item-resizer", this.templateFullCustomFile_);

					//this._pageLayout.bind(this)をすると、新しいオブジェクトを返すので、off("resize", )の際にも使うため、メンバーに記憶する
					//bind(this)することで、thisを _pageLayout に渡せる。bindがないとが thisが他のポイントをさせる。
					this.bindedLayoutPage = this._pageLayout.bind(this);
					$(window).on("resize", $.proxy(this.bindedLayoutPage, this));

					this.currentWindow_ = Remote.getCurrentWindow();
					// コンテキストメニュー
					this.contextMenu_ = new Menu();

					// CommandManager の初期化
					if (this.commandManager_) {
						this.commandManager_.reset();
					} else {
						this.commandManager_ = new CommandManager();
                    }

					//テキストフィールドにフォーカス
					var $remoteName: JQuery = $("#input-face-name");
					this.setFocusAndMoveCursorToEnd($remoteName);

                    this.isTextBoxFocused = false;

                    // NEW(remoteId === undefined)の場合ドロップダウンメニューの項目から
                    // 「このリモコンを削除」とセパレータを削除する
                    if (remoteId == undefined) {
                        $("li#command-delete-remote").remove();
                        $("li.menu-item-separator").remove();
                    }

					//html上の文言をローカライズ
					$("#page-title-edit").html($.i18n.t("edit.STR_EDIT_TITLE"));
					$("#button-add-page").html($.i18n.t("edit.canvas.STR_EDIT_CANVAS_NEW_PAGE_BTN"));

				});
			}

			onPageBeforeHide(event: JQueryEventObject, data?: Framework.HideEventData) {
				let FUNCTION_NAME = TAG + "onPageBeforeHide :";

				if (this.bindedLayoutPage == null) {
					console.warn(FUNCTION_NAME + "this.bindedLayoutPage is null");
					$(window).off("resize", this._pageLayout);
				} else {
					$(window).off("resize", this.bindedLayoutPage);
				}
				
				super.onPageBeforeHide(event, data);
			}

            events(): any {
                var ret: any = {};
                ret = super.events();

				return $.extend(ret,{
					// パレット内のアイテムのダブルクリック
					"dblclick #face-pallet .item": "onPalletItemDblClick",

					// 画面内のマウスイベント
					"mousedown #main": "onMainMouseDown",
					"mousemove #main": "onMainMouseMove",
					"mouseup #main": "onMainMouseUp",

					// キャンバスのページスクロール
                    "scroll #face-canvas #face-pages-area": "onCanvasPageScrolled",
                    "scroll #face-pallet #face-pages-area": "onPalletPageScrolled",

					// キャンバス内のページ追加ボタン
					"click #button-add-page": "onAddPageButtonClicked",

					//キャンバス内のボタンアイテムをhover
					"mouseenter #face-canvas #face-pages-area .button-item ": "onHoverButtonItemInCanvas",
					"mouseleave #face-canvas #face-pages-area .button-item ": "onHoverOutButtonItemInCanvas",
					"mouseleave #canvas-tooltip" : "onHoverOutTooltip",

					// 詳細編集エリアのイベント
					"change #face-item-detail input": "onItemPropertyChanged",
					'change #input-face-name ': "onRemoteNameTextFieldChanged",
                    "change #face-item-detail select": "onItemPropertySelectChanged",
                    "click #face-item-detail .custom-select": "onItemPropertySelectClicked",

					"click #refer-image": "onReferImageClicked",
					"click .refer-state-image": "onReferImageClicked",
					"click #delete-background-image": "onDeleteImageClicked",
					"click .delete-state-image": "onDeleteImageClicked",
					"click #add-state": "onAddButtonStateClicked",
                    "click .remove-state": "onRemoveButtonStateClicked",

					//画像変更用popup
                    "click #edit-image-or-text": "onEditImageButtonClicked",
					"click #edit-image-background": "onEditImageBackgroundClicked",
                    "click #edit-image-non-button-image": "onEditImageNonButtonImageClicked",
					"click #command-change-button-image": "onEditImageButtonInPopupClicked",
					"click #command-change-button-text": "onEditTextButtonInPopupClicked",

					//リモコン名編集用のテキストフィールド
					"click #input-face-name" : "onRemoteNameTextFieldClicked",

					// 編集完了ボタン
                    "click #button-edit-done": "onEditDoneButtonClicked",
                    // 戻るボタン
                    "click #button-edit-back": "onBackButtonClicked",
                    // ショートカットキー
                    "keydown": "_onKeyDown",
                    // プルダウンメニュー
                    "click #option-pulldown-menu": "_onOptionPullDownMenuClick",
					// コンテキストメニュー
					"contextmenu": "onContextMenu",

                    // プルダウンメニューのリスト
                    "vclick #command-delete-remote": "_onCommandDeleteRemote",
                    "vclick #command-about-this": "_onCommandAboutThis",
                    "vclick #command-visit-help": "_onCommandVisitHelp",

                    // テキストボックスへのfocusin/out　テキストボックスにfocusされている場合はBS/DELキーでの要素削除を抑制する
                    "focusin input[type='text']": "_onTextBoxFocusIn",
                    "focusout input[type='text']": "_onTextBoxFocusOut",
				});
			}

			render(): FullCustom {
				// Please add your code
				return this;
			}


			/*
			* テキストエリアにフォーカスを移し、カーソルを末尾に移動する。
			*/
			private setFocusAndMoveCursorToEnd($target) {
				var FUNCTION_NAME = "setFocusAndMoveCursorToEnd";

				if (_.isUndefined($target)) {
					console.log(FUNCTION_NAME + ": $target is Undefined");
					return;
				}

				if ($target.attr('type') !== "text") {
					console.log(FUNCTION_NAME + ": $target is not input[text]");
					return;
				}

				var remoteName: string = $target.val();
				$target.val("");
				$target.focus();
				$target.val(remoteName);

				this.isTextBoxFocused = true;
			}


			/**
			 * 画面のレイアウト。
			 * ウィンドウリサイズされたときも呼び出される。
			 */
			private _pageLayout() {
				const PALLET_AREA_WIDTH_MIN = 320;
				const PALLET_AREA_WIDTH_MAX = 640;
				const PALLET_AREA_HEIGHT_MIN = 640;
				const EDIT_AREA_WIDTH_MIN = 640;
				const EDIT_AREA_HEIGHT_MIN = 640;
				var windowWidth = innerWidth;
				var windowHeight = innerHeight;

				var mainHeight = innerHeight - $("#main").offset().top;

				if (this != null) {
					this.closeAllPopups();
				}

				let facePalletArea = {
					width: PALLET_AREA_WIDTH_MIN,
					height: PALLET_AREA_HEIGHT_MIN < mainHeight ? mainHeight : PALLET_AREA_HEIGHT_MIN
				};
				// パレットエリアの width はウィンドウの width の 40% とするが、
				// 最大サイズと最小サイズを考慮する
				let windowWidth40per = Math.round(windowWidth * 0.4);
				if (PALLET_AREA_WIDTH_MIN < windowWidth40per) {
					if (windowWidth40per < PALLET_AREA_WIDTH_MAX) {
						facePalletArea.width = windowWidth40per;
					} else {
						facePalletArea.width = PALLET_AREA_WIDTH_MAX;
					}
				}

				// エディットエリアの width はウィンドウの width からパレットエリアの width を引いたもの
				// ただし、エディットエリアの　width の最小サイズを考慮する
				let faceEditArea = {
					width: EDIT_AREA_WIDTH_MIN < windowWidth - facePalletArea.width ? windowWidth - facePalletArea.width : EDIT_AREA_WIDTH_MIN,
					height: EDIT_AREA_HEIGHT_MIN < mainHeight ? mainHeight : EDIT_AREA_HEIGHT_MIN
				};

				$("#main").css({
					width: innerWidth + "px",
					height: mainHeight + "px"
				});

				/* キャンバス部分の座標の指定 */
                let faceCanvasAreaWidth = $("#face-canvas-area").width();
                let faceCanvasAreaLeft = (windowWidth/2) - (faceCanvasAreaWidth/2);
				$("#face-canvas-area").css({
					left: faceCanvasAreaLeft + "px"
                });

				/* 詳細編集部分 */
                //詳細編集エリアのY座標
                let PROPATY_AREA_MARGIN_RIGHT = 100;
                let detailWidth = $("#face-item-detail-area").outerWidth();

                let detailLeft = faceCanvasAreaLeft - (PROPATY_AREA_MARGIN_RIGHT + detailWidth);
                $("#face-item-detail-area").css({
                    left: detailLeft + "px",
                });

                //パレットエリアのY座標
                let PALLET_AREA_MARGIN_LRFT = 44;
                let palletAreaLeft = faceCanvasAreaLeft + faceCanvasAreaWidth + PALLET_AREA_MARGIN_LRFT; 
				/* パレットエリア */
				$("#face-pallet-area").css({
                    left: palletAreaLeft + "px",
				});

				var facePalletMaxHeight = facePalletArea.height - 120;
                // pallet部分(pallet areaの中の、参照元のリモコンが表示されるエリア)は
               // パレットエリア内で左右均等に配置できるように。
                var $facePallet = $("#face-pallet");
                let facePalletWidth = $facePallet.width();
                let facePalletAreaWidth = $("#face-pallet-area").width();
                let facePalletLeft = (facePalletAreaWidth / 2) - (facePalletWidth / 2);
				$facePallet.css({
                    left: facePalletLeft
                });

				// faceList の更新
				if (this != null) {
					this._layoutFacesList();
				}

				
			}

			/**
			 * face canvas を作成する。
			 */
			private _renderCanvas(remoteId?: string) {
				var $faceCanvasArea = $("#face-canvas-area");
				var face = remoteId ? huisFiles.getFace(remoteId) : null;
				if (face) {
					this.faceRenderer_canvas_ = new FaceRenderer({
						el: $faceCanvasArea,
						attributes: {
							face: face,
							type: "canvas",
							materialsRootPath: HUIS_FILES_DIRECTORY
						}
					});
				} else {
					this.faceRenderer_canvas_ = new FaceRenderer({
						el: $faceCanvasArea,
						attributes: {
							remoteId: huisFiles.createNewRemoteId(),
							type: "canvas",
							materialsRootPath: HUIS_FILES_DIRECTORY
						}
					});
					this.newRemote_ = true;
				}

				this.faceRenderer_canvas_.render();

				this._setGridSize(this.gridSize_);


				this.currentTargetPageIndex_ = 0;

				// [TODO] Canvas 内の page scroll
                $faceCanvasArea.find("#face-pages-area").scroll((event: JQueryEventObject) => {
					this.onCanvasPageScrolled(event);
                });

              
			}

			/**
			 * HUIS 内の face の一覧を表示する
			 */
			private _listupFaces() {
				// fullcustom と "Air conditioner" を除いた face 一覧を取得する
				// "Air conditioner" のボタンの形式が Garage では扱えないもののため 
				var faces = huisFiles.getFilteredFacesByCategories({ unmatchingCategories: ["fullcustom", "custom", "special", "Bluetooth", "Air conditioner"] });
				// faces データから face 一覧を作成し、face list に追加する
				var faceItemTemplate = Tools.Template.getJST("#template-face-item", this.templateFullCustomFile_);
				$("#face-item-list").append($(faceItemTemplate({ faces: faces })));

				// face list の左スクロールボタン
				var $listScrollLeft = $("#face-item-list-scroll-left");
				// face list の右スクロールボタン
				var $listScrollRight = $("#face-item-list-scroll-right");

				$listScrollLeft.addClass("disabled");
				$listScrollRight.addClass("disabled");


				// face list から face を選択すると、選択した face をパレットにをレンダリングする
                var $faceItem = $(".face-item");
                var $faceItemList = $("#face-item-list");

                $faceItem.on("click", (event: JQueryEventObject) => {
                    this._onFaceItemSelected($(event.currentTarget));
				});


				// face list のスクロール (左方向)
				$listScrollLeft.click(() => {
					if ($listScrollLeft.hasClass("disabled")) {
						return;
					}
					let faceItemListContainerWidth: number = $("#face-item-list-container").outerWidth();
					//ヘッダー幅の半分移動する。
                    this.faceListScrollLeft_ -= faceItemListContainerWidth / 2;
                    this.disableScrollLeftButton();
					$listScrollRight.removeClass("disabled");
                    $faceItemList.css("transform", "translateX(" + ((-1) * this.faceListScrollLeft_)+ "px)");
				});

				// face list のスクロール (右方向)
				$listScrollRight.click(() => {
					if ($listScrollRight.hasClass("disabled")) {
						return;
					}

					let faceItemListContainerWidth:number = $("#face-item-list-container").outerWidth();
					//ヘッダー幅の半分移動する。
                    this.faceListScrollLeft_ += faceItemListContainerWidth/2;
                    this.disableScrollRightButton();					
					$listScrollLeft.removeClass("disabled");
					$faceItemList.css("transform", "translateX(" + ((-1)*this.faceListScrollLeft_) + "px)");
                });

                this._layoutFacesList();

            }

            /*
            * パレットエリアの初期選択リモコンを設定
            */
            private selectFirstRemtoeInFaceList() {
                let $faceItems = $(".face-item");
                if (!$faceItems.hasClass("active")) {
                    //アニメの秒数を一度0にする
                    var animeValueTmp = $("#face-item-list").css("transition-duration");
                    $("#face-item-list").css("transition-duration", "0s");
                    if ($faceItems.length !== 1) {//初期状態で、一番左のリモコンを選択。
                        this._onFaceItemSelected($($faceItems[1]));
                    } else {//リモコンが一つもない場合はcommonを選択。
                        this._onFaceItemSelected($($faceItems[0]));
                    }
                    //アニメの秒数を戻す。
                    $("#face-item-list").css("transition-duration", animeValueTmp);
                }
            }

            /**
            * パレットエリアのface-itemが選択された際の処理
            * @ $clickedFaceItem 選択されたface-item:jQuery
            **/
            private _onFaceItemSelected($clickedFaceItem: JQuery) {
                var $faceItem = $(".face-item");
                var $faceItemList = $("#face-item-list");
                //選択したfaceItemを移動。
                this._moveSelectedFaceItemToCenterOfFaceList($clickedFaceItem);
                let remoteId: string = "" + JQUtils.data($clickedFaceItem, "remoteId"); //$clickedFaceItem.data("remoteId");
                $faceItem.removeClass("active");
                $clickedFaceItem.addClass("active");
                this._renderFacePallet(remoteId);
            }

            /**
            * 選択したfaceItemがfaceListの中央になるように移動
            * @ $clickedFaceItem 選択されたface-item:jQuery
            **/
            private _moveSelectedFaceItemToCenterOfFaceList($clickedFaceItem : JQuery) {
                var $faceItem = $(".face-item");
                var $faceItemList = $("#face-item-list");
                var $faceItemListContainer = $("#face-item-list-container");
                
                
                var FaceListWidth = $faceItemListContainer.width();

                //face-itemの現在の位置を取得する。
                var positionLeft: any = $clickedFaceItem.css("left").replace('px', '');
                //face-item-llistの中央の値との差分を算出
                this.faceListScrollLeft_ = positionLeft - (FaceListWidth / 2) + ($clickedFaceItem.outerWidth() / 2);
                var fineTuneLeft = $("#face-item-list-scroll-margin-left").width()/2; 
                this.faceListScrollLeft_ += fineTuneLeft;//face-listで隠れてる部分があるため、そのぶんずらす必要がある。
                this.disableScrollRightButton();
                this.disableScrollLeftButton();

                //差分分、移動する。
                $faceItemList.css("transform", "translateX(" + ((-1) * this.faceListScrollLeft_) + "px)");
            }

            /**
            * 右スクロールボタンの非表示判定
            */
            private disableScrollRightButton() {
                // face list の右スクロールボタン
                let $listScrollRight = $("#face-item-list-scroll-right");
				let faceListWidth = $("#face-item-list-container").width();
				let fineTuneLeft = $("#face-item-list-scroll-margin-left").width() / 2; //face-listで隠れてる部分があるため、そのぶんずらす必要がある。
				

				let $faceItems : JQuery= $("#face-item-list").find(".face-item");
				let $lastFaceItem : JQuery = $($faceItems[$faceItems.length - 1]);
				let lastFaceItemWidth = $lastFaceItem.outerWidth();

				let MAX_SCROLL_RIGHT = this.faceListTotalWidth_ - (faceListWidth / 2) + fineTuneLeft - (lastFaceItemWidth/2);//右端は最後のfacelist要素のが中央になる
                if (this.faceListScrollLeft_ >= MAX_SCROLL_RIGHT){
                    this.faceListScrollLeft_ = MAX_SCROLL_RIGHT;
                    $listScrollRight.addClass("disabled");
                } else {
                    $listScrollRight.removeClass("disabled");
                }
            }


            /**
           * 左スクロールボタンの非表示判定
           */
            private disableScrollLeftButton() {
                // face list の左スクロールボタン
                var faceListWidth = $("#face-item-list-container").width();
                var faceItemCommonWidth = $('.face-item[data-remote-id="common"]').outerWidth();
                var fineTuneLeft = $("#face-item-list-scroll-margin-left").width()/2; //face-listで隠れてる部分があるため、そのぶんずらす必要がある。

                var MIN_SCROLL_LEFT = -(faceListWidth / 2) + (faceItemCommonWidth / 2) + fineTuneLeft;//左端はCOMMONが中央になる
                var $listScrollLeft = $("#face-item-list-scroll-left");
                if (this.faceListScrollLeft_ <= MIN_SCROLL_LEFT) {
                    this.faceListScrollLeft_ = MIN_SCROLL_LEFT;
                    $listScrollLeft.addClass("disabled");
                } else {
                    $listScrollLeft.removeClass("disabled");
                }
            }

			/**
			 * face list のレイアウトを行う
			 */
			private _layoutFacesList() {
				// list の width を設定する
				setTimeout(() => {
					let totalWidth = 0;
					let $faceItems = $(".face-item");
					let $listScrollLeft = $("#face-item-list-scroll-left");
					let $listScrollRight = $("#face-item-list-scroll-right");
					$faceItems.each((index: number, elem: Element) => {
						$(elem).css("left", totalWidth + "px");
						totalWidth += $(elem).outerWidth();
						if ($faceItems.length - 1 <= index) {
							$("#face-item-list").width(totalWidth);
							this.faceListTotalWidth_ = totalWidth;
							this.faceListContainerWidth_ = $("#face-item-list-container").width();
							if (this.faceListContainerWidth_ < this.faceListTotalWidth_
								&& this.faceListContainerWidth_ != undefined
									&& this.faceListTotalWidth_ != undefined ) {
								$listScrollRight.removeClass("disabled");
							}
								
							this.disableScrollLeftButton();
							this.disableScrollRightButton();
							$("#face-item-list").css("transform", "translateX(" +((-1)* this.faceListScrollLeft_ )+ "px)");
							
						}
                    }
                    );
                    this.selectFirstRemtoeInFaceList();
				}, 0);
			}

			/**
			 * 指定した remoteId の face をパレットにレンダリングする
			 */
			private _renderFacePallet(remoteId: string) {
				var $facePallet = $("#face-pallet");
                $facePallet.find("#face-pages-area").remove();

				var face: IGFace;
				if (remoteId === "common") {
					face = huisFiles.getCommonFace();
					$facePallet.addClass("common-parts");
				} else {
					face = huisFiles.getFace(remoteId);
					$facePallet.removeClass("common-parts");
				}

				this.faceRenderer_pallet_ = new FaceRenderer({
					el: $facePallet,
					attributes: {
						face: face,
						materialsRootPath: HUIS_FILES_DIRECTORY
					}
				});
				this.faceRenderer_pallet_.render();

				//それぞれのボタンにtitleを追加
				this.addTitleToEachItemInPallet();

                this._pageLayout();
                //スクロールイベント
                $facePallet.find("#face-pages-area").scroll((event: JQueryEventObject) => {
                    this.onPalletPageScrolled(event);
                });
                
                this.displayGradationInPalletArea(0, $facePallet.find("#face-pages-area"));
			}


			/**
			 * PalletArea内のitemに、title要素を追加する。
			 * 
			 */
			private addTitleToEachItemInPallet() {
				var $itemsInPallet = $("#face-pallet").find(".face-page").find(".item");
				var STR_TOOLTIP_IN_PALLET = $.i18n.t("tooltip.STR_TOOLTIP_PALLET_ITEMS");
				$itemsInPallet.each((index: number, element: Element) => {
					var $element = $(element);
					$element.attr("title", STR_TOOLTIP_IN_PALLET);
				});
			}


			/**
			 * URL クエリーパラメーターを取得する
			 * 
			 * @param key {string} URL クエリーパラメーターから取得したい値のキー
			 * @return {string} 指定したキーの値。取得できない場合は undefined
			 */
			private _getUrlQueryParameter(key: string): string {
				var urlParams = window.location.href.split("?");
				if (urlParams.length < 2) {
					return undefined;
				}
				var search = urlParams[1];
				var queryParams = search.split("&");
				for (let i = 0, l = queryParams.length; i < l; i++) {
					let paramElements = queryParams[i].split("=");
					let paramKey = decodeURIComponent(paramElements[0]);
					if (paramKey === key) {
						return decodeURIComponent(paramElements[1]);
					}
				}

				return undefined;
			}


			/**
			 * パレット内のアイテムをダブルクリック
			 */
			private onPalletItemDblClick(event: Event) {
				var $target = $(event.currentTarget);
				var $parent = $target.parent();
				var targetModel = this._getItemModel($target, "pallet");
				if (!targetModel) {
					return;
				}

				// 現在ターゲットとなっているページを追加先とする
				var moduleId_canvas: string = this._getCanvasPageModuleId();
				var moduleOffsetY_pallet: number = parseInt(JQUtils.data($parent, "moduleOffsetY"), 10); //$parent.data("module-offset-y");

				var model: ItemModel;

				switch (targetModel.type) {
					case "button":
						if (targetModel.button) {
							// ボタンの配置元のマスターリモコンから、ボタンがひも付けられている機器を設定する
							let remoteId = this.faceRenderer_pallet_.getRemoteId();
							let functions = huisFiles.getMasterFunctions(remoteId);
							let codeDb = huisFiles.getMasterCodeDb(remoteId);
							let functionCodeHash = huisFiles.getMasterFunctionCodeMap(remoteId);

							let deviceInfo: IButtonDeviceInfo = {
								functions: functions,
								code_db: codeDb
							};

							if (functionCodeHash != null) {
								deviceInfo = {
									functions: functions,
									code_db: codeDb,
									functionCodeHash: functionCodeHash,
								};
							}

							targetModel.button.deviceInfo = deviceInfo;
							model = this.faceRenderer_canvas_.addButton(targetModel.button, moduleId_canvas, moduleOffsetY_pallet);
						}
						break;

					case "image":
						if (targetModel.image) {
							model = this.faceRenderer_canvas_.addImage(targetModel.image, moduleId_canvas, moduleOffsetY_pallet, () => {
								// 画像変換・コピーが完了してからでないと background-image に画像が貼れないため、
								// このタイミングで CSS を更新
								this._updateItemElementOnCanvas(model);
							});
						}
						break;

					case "label":
						if (targetModel.label) {
							model = this.faceRenderer_canvas_.addLabel(targetModel.label, moduleId_canvas, moduleOffsetY_pallet);
						}
						break;

					default:
				}

				if (!model) {
					return;
				}

				// model 状態を有効にする
				var memento: IMemento = {
					target: model,
					previousData: {
						enabled: false
					},
					nextData: {
						enabled: true
					}
				};
				var mementoCommand = new MementoCommand(memento);
				this.commandManager_.invoke(mementoCommand);

				this._updateItemElementOnCanvas(model);
			}

			/**
			 * フルカスタム編集画面での mousedown イベントのハンドリング
			 */
			private onMainMouseDown(event: Event) {
				if (event.type !== "mousedown") {
					console.error(TAG + "onMainMouseDown() Invalid event type: " + event.type);
					return;
				}

				this.selectedResizer_ = null;

				var mousePosition: IPosition = {
					x: event.pageX,
					y: event.pageY
				};

				// 直前に選択していたものと同一のアイテムを選択しているかチェック
				var remainsTarget = this._remainsTarget(mousePosition);
				// 選択しているリサイザーをチェック
				var selectedResizer = this._checkResizerSelected(mousePosition);
				// 詳細編集エリア上を選択しているかをチェック
				var overDetailArea = this._checkDetailItemAreaPosition(mousePosition);

				// マウスポインター位置が、選択中のターゲット上は、
				// ターゲットを外す
				if (!remainsTarget && !selectedResizer && !overDetailArea) {
					// 直前に選択されていたボタンの状態更新があれば行う
					this._updateCurrentModelButtonStatesData();

					// 現在のターゲットを外す
					this._loseTarget();

					//CanvasのFacePagesArea上でない場合は反応しない
					if (this.isOnCanvasFacePagesArea(mousePosition)) {
					// マウスポインター位置にアイテムがあれば取得する
						let $target = this._getTarget(mousePosition);
						if ($target) {

							$target.focus();
							console.log("target " + JQUtils.data($target, "cid")); //$target.data("cid"));
							this.$currentTarget_ = $target;
							// target に紐付くモデルを取得
							this.currentTargetModel_ = this._getItemModel(this.$currentTarget_, "canvas");

							// 選択状態にする
							this.$currentTarget_.addClass("selected");

							//ツールチップを非表示にする。
							this.disableButtonInfoTooltip();

							// リサイザーを追加
							this._setResizer(this.$currentTarget_);

							// 詳細編集エリアを表示
							$("#face-item-detail-area").addClass("active");
							this._showDetailItemArea(this.currentTargetModel_);
						

						} else {
							// マウスポインター位置にアイテムが存在しない場合で、
							// canvas 上のページモジュールを選択した場合は、ページの背景編集を行う
							let $page = this._getTargetPageModule(mousePosition);
							if ($page) {
								// ページ背景の model の作成、もしくは既存のものを取得する
								let backgroundImageModel = this._resolvePageBackgroundImageItem($page);
								this.currentTargetModel_ = {
									type: "image",
									image: backgroundImageModel
								};
								$("#face-item-detail-area").addClass("active");
								// ページの背景の detail エリアを作成する
								this._showDetailItemAreaOfPage($page);
							}
						}

					}
				}
				if (remainsTarget) {
					// 選択中のアイテムがボタンの場合、状態の更新を行う
					this._updateCurrentModelButtonStatesData();
				}
				if (selectedResizer) {
					this.selectedResizer_ = selectedResizer;
					console.log(this.selectedResizer_);
				}
				if (this.$currentTarget_ && this.isOnCanvasFacePagesArea(mousePosition)) {
					this.mouseMoveStartPosition_ = mousePosition;
					this.mouseMoveStartTargetPosition_ = {
						x: parseInt(this.$currentTarget_.css("left"), 10),
						y: parseInt(this.$currentTarget_.css("top"), 10)
					};
					this.mouseMoveStartTargetArea_ = {
						x: parseInt(this.$currentTarget_.css("left"), 10),
						y: parseInt(this.$currentTarget_.css("top"), 10),
						w: parseInt(this.$currentTarget_.css("width"), 10),
						h: parseInt(this.$currentTarget_.css("height"), 10)
					};
					// 詳細編集エリア上の場合は、mousemove 状態にしない
					if (!overDetailArea) {
						this.mouseMoving_ = true;
						event.preventDefault();

						//preventDefaultしてしまうと、すべてのフォーカスがはずれてKeydownが働かなくなってしまう。
						//そのため、preventDefault直後にフォーカスを設定しなおす。
						this.$el.focus();
					}
				}
			}

			/*
			* 入力のマウスポインター位置が、CanvasエリアのFacePagesAreaの上か判定する。
			* @param mousePosition : IPosition マウスポインター
			* @return result : boolean  CanvasAreaのFacePagesAreaの上の場合true, 違う場合false
			*/
			private isOnCanvasFacePagesArea(mousePosition: IPosition):boolean {
				let FUNCTION_NAME: string = TAG + " : isOnCanvasFacePagesArea :";
				if (mousePosition == undefined) {
					console.warn(FUNCTION_NAME + "mousePosition is undefined");
					return false;
				}

				let $facePagesAreaOnCanvas: JQuery = $("#face-canvas").find("#face-pages-area");

				if ($facePagesAreaOnCanvas == undefined) {
					console.warn(FUNCTION_NAME + "$facePagesAreaOnCanvas is undefined");
					return false;
				}

				let facePagesAreaLeft:number = $facePagesAreaOnCanvas.offset().left;
				let facePagesAreaRight:number = $facePagesAreaOnCanvas.offset().left + $facePagesAreaOnCanvas.width()/2;
				let facePagesAreaTop :number= $facePagesAreaOnCanvas.offset().top;
				let facePagesAreaBottom :number= $facePagesAreaOnCanvas.offset().top + $facePagesAreaOnCanvas.height()/2;

				if (mousePosition.x > facePagesAreaLeft && mousePosition.x < facePagesAreaRight
					&& mousePosition.y > facePagesAreaTop && mousePosition.y < facePagesAreaBottom) {
					return true;
				} else {
					return false;
				}

			}

			/**
			 * フルカスタム編集画面での mousemove イベントのハンドリング
			 */
            private onMainMouseMove(event: Event) {
                
				if (event.type !== "mousemove") {
					console.error(TAG + "onMainMouseMove() Invalid event type: " + event.type);
					return;
				}
				if (!this.$currentTarget_ || !this.mouseMoving_) {
					return;
				}

				
				//マウスがWindowSizeよりはみ出していた場合、フォーカスを外す
				if (event.pageX < 0 + MARGIN_MOUSEMOVABLE_LEFT || event.pageX > innerWidth - MARGIN_MOUSEMOVABLE_RIGHT
					|| event.pageY < 0 + MARGIN_MOUSEMOVALBE_TOP || event.pageY > innerHeight - MARGIN_MOUSEMOVALBE_BOTTOM) {
					event.type = "mouseup";
					this.onMainMouseUp(event);
					return;
				}

				// リサイザーが選択されている場合は、アイテムのリサイズを行う
				if (this.selectedResizer_) {
					this._resizeItem({ x: event.pageX, y: event.pageY }, false);
				} else {

					var deltaX = event.pageX - this.mouseMoveStartPosition_.x;
					var deltaY = event.pageY - this.mouseMoveStartPosition_.y;

                    var newX;
                    var newY;

                    //グリッドがデフォルトの場合は、左右にBIAS_Xの利用不能エリアがある。
                    if (this.gridSize_ === DEFAULT_GRID) {
                        var BIAS_X = BIAS_X_DEFAULT_GRID_LEFT;
                        var BIAS_Y = 0

                        newX = Math.floor((this.mouseMoveStartTargetPosition_.x + deltaX * 2) / this.gridSize_) * this.gridSize_ + BIAS_X;
                        newY = Math.floor((this.mouseMoveStartTargetPosition_.y + deltaY * 2) / this.gridSize_) * this.gridSize_ + BIAS_Y;

                    } else {
                        newX = Math.floor((this.mouseMoveStartTargetPosition_.x + deltaX * 2) / this.gridSize_) * this.gridSize_;
                        newY = Math.floor((this.mouseMoveStartTargetPosition_.y + deltaY * 2) / this.gridSize_) * this.gridSize_;

                    }

					this.$currentTarget_.css({
						"left": newX + "px",
						"top": newY + "px"
					});
				}
			}

			/**
			 * フルカスタム編集画面での mouseup イベントのハンドリング
			 */
			private onMainMouseUp(event: Event) {
				if (event.type !== "mouseup") {
					console.error(TAG + "onMainMouseUp() Invalid event type: " + event.type);
					return;
				}
				if (!this.$currentTarget_ || !this.mouseMoving_) {
					return;
				}

				var position = { x: event.pageX, y: event.pageY };

				// リサイザーが選択されている場合は、アイテムのリサイズを行う
				if (this.selectedResizer_) {
					this._resizeItem(position, true);
				} else { // それ以外の場合は、アイテムの移動
					this._moveItem(position);
				}
				this.mouseMoving_ = false;
			}

			/**
			 * アイテムの移動を行う
			 */
            private _moveItem(position: IPosition, update?: boolean) {

				var deltaX = event.pageX - this.mouseMoveStartPosition_.x;
				var deltaY = event.pageY - this.mouseMoveStartPosition_.y;
				if (deltaX === 0 && deltaY === 0) {
					return;
				}
                var newX;
                var newY;

                //グリッドがデフォルトの場合は、左右にBIAS_Xの利用不能エリアがある。
                if (this.gridSize_ === DEFAULT_GRID) {
                    var BIAS_X = BIAS_X_DEFAULT_GRID_LEFT;
                    var BIAS_Y = 0
                    var MAX_X = $(".face-page").width() - BIAS_X_DEFAULT_GRID_LEFT;

                    newX = Math.floor((this.mouseMoveStartTargetPosition_.x + deltaX * 2) / this.gridSize_) * this.gridSize_ + BIAS_X;
                    newY = Math.floor((this.mouseMoveStartTargetPosition_.y + deltaY * 2) / this.gridSize_) * this.gridSize_ + BIAS_Y;

                    if (newX < BIAS_X) {
                        newX = BIAS_X;
                    } else if (newX + this.$currentTarget_.width() > MAX_X) {
                        newX = MAX_X - this.$currentTarget_.width();
                    }

                } else {
                    newX = Math.floor((this.mouseMoveStartTargetPosition_.x + deltaX * 2) / this.gridSize_) * this.gridSize_;
                    newY = Math.floor((this.mouseMoveStartTargetPosition_.y + deltaY * 2) / this.gridSize_) * this.gridSize_;
                }

				this.$currentTarget_.css({
					"left": newX + "px",
					"top": newY + "px"
				});
                
				// 新しい area の妥当性を検証し、調整済みの area を取得する
				var newArea = this._validateArea({
					x: newX,
					y: newY
				});
				this._updateCurrentModelData("area", newArea);
				this._showDetailItemArea(this.currentTargetModel_);
            }


			/**
			 * アイテムのリサイズを行う
			 */
			private _resizeItem(position: IPosition, update?: boolean) {


				var calculateNewArea = (baseArea: IArea, deltaX: number, deltaY: number): IArea => {
					var newArea: IArea = $.extend(true, {}, baseArea);

					switch (this.selectedResizer_) {
						case "left-top":
							newArea.x += deltaX;
							newArea.y += deltaY;
							newArea.w -= deltaX;
							newArea.h -= deltaY;
							break;

						case "right-top":
							newArea.y += deltaY;
							newArea.w += deltaX;
							newArea.h -= deltaY;
							break;

						case "right-bottom":
							newArea.w += deltaX;
							newArea.h += deltaY;
							break;

						case "left-bottom":
							newArea.x += deltaX;
							newArea.w -= deltaX;
							newArea.h += deltaY;
							break;

						default:
							;
					}

					//グリッドがデフォルトの場合は、左右にBIAS_Xの利用不能エリアがある。
                    if (this.gridSize_ === DEFAULT_GRID) {
                        // グリッドスナップ用に調整
						
						newArea.w = this.getGridCordinate(newArea.w);
                        newArea.h = this.getGridCordinate(newArea.h);

						//widthに変化がない場合は、xは変更しない。
						//xが変化する場合(left-top/left-bottom)の場合のみxは変更
						if (newArea.w != baseArea.w && newArea.x != baseArea.x) {
							let deltaW: number = newArea.w - baseArea.w;
							newArea.x = baseArea.x - deltaW ;
							newArea.x = this.getGridCordinate(newArea.x) + BIAS_X_DEFAULT_GRID_LEFT; 
							//newArea.x = this.getGridCordinate(newArea.x) + BIAS_X_DEFAULT_GRID_LEFT;
						} else {
							newArea.x = baseArea.x;
						}

						//hwightに変化がない場合は、yは変更しない。
						if (newArea.h != baseArea.h && newArea.y != baseArea.y) {
							let deltaH: number = newArea.h - baseArea.h;
							newArea.y = baseArea.y - deltaH;
							newArea.y = this.getGridCordinate(newArea.y);
						} else {
							newArea.y = baseArea.y;
						}
                        

                    } else {
                        // グリッドスナップ用に調整
                        newArea.x = this.getGridCordinate(newArea.x);
                        newArea.y = this.getGridCordinate(newArea.y);
                        newArea.w = this.getGridCordinate(newArea.w);
                        newArea.h = this.getGridCordinate(newArea.h);
                    }

					return newArea;
				};

				var deltaX = position.x - this.mouseMoveStartPosition_.x;
				var deltaY = position.y - this.mouseMoveStartPosition_.y;

				if (deltaX === 0 && deltaY === 0) {
					return;
				}

				//canvasAreaは実際の大きさの1/2に表示されているため、mouseの移動量は2倍にする。
				var newArea = calculateNewArea(this.mouseMoveStartTargetArea_, deltaX*2, deltaY*2);

				this.$currentTarget_.css({
					left: newArea.x + "px",
					top: newArea.y + "px",
					width: newArea.w + "px",
					height: newArea.h + "px",
					lineHeight: newArea.h + "px"
				});
				if (this.currentTargetModel_.type === "button") {
					this._resizeButtonStateItem(this.$currentTarget_, newArea);
					this._updateCurrentModelStateData(undefined, "resized", true);
					//let stateId = parseInt(JQUtils.data($select, "stateId"), 10);
					//this._updateCurrentModelStateData(stateId, "resized", true);
				}
				if (update) {
					let validateArea = this._validateArea(newArea);
					this._updateCurrentModelData("area", validateArea);
					this._showDetailItemArea(this.currentTargetModel_);
					this._setResizer(this.$currentTarget_);
				} else {
					this._setResizer(this.$currentTarget_);
				}
			}


			/**
			 * グリッドに沿うように座標を変換.
             * input:face-page上の座標値　: number
             * return : グリッドに沿った　face-page上の座標値 : number
			 */
            private getGridCordinate (inputCordinate :number):number{
                return inputCordinate = Math.floor(inputCordinate / this.gridSize_) * this.gridSize_;
            }

			/**
			 * button.state にある label. image のリサイズ (canvas 上における表示のリサイズ)
			 */
			private _resizeButtonStateItem($button: JQuery, newArea: IArea) {
				var $states = $button.find(".button-state");
				$states.each((index: number, element: Element) => {
					let $element = $(element);
					$element.children().each((index: number, child: Element) => {
						let $child = $(child);
						let areaRatioX = parseFloat(JQUtils.data($child, "ratioX")); //$child.data("ratio-x");
						let areaRatioY = parseFloat(JQUtils.data($child, "ratioY")); //$child.data("ratio-y");
						let areaRatioW = parseFloat(JQUtils.data($child, "ratioW")); //$child.data("ratio-w");
						let areaRatioH = parseFloat(JQUtils.data($child, "ratioH")); //$child.data("ratio-h");
						// areaRatio の全プロパティーが揃っている場合は、ボタンの area に areaRatio を掛け合わせる
						if (!_.isUndefined(areaRatioX) && !_.isUndefined(areaRatioY) && !_.isUndefined(areaRatioW) && !_.isUndefined(areaRatioH)) {
							$child.css({
								left: newArea.w * areaRatioX + "px",
								top: newArea.h * areaRatioY + "px",
								width: newArea.w * areaRatioW + "px",
								height: newArea.h * areaRatioH + "px",
								lineHeight: newArea.h * areaRatioH + "px"
							});
						} else {
							$child.css({
								left: 0,
								top: 0,
								width: newArea.w + "px",
								height: newArea.h + "px",
								lineHeight: newArea.h + "px"
							});
						}
					});
				});
			}

			/**
			 * コンテキストメニュー
			 */
			private onContextMenu(event: Event) {
				event.preventDefault();
				this.rightClickPosition_ = {
					x: event.pageX,
					y: event.pageY
				};

				// コンテキストメニューを作成する
				this.contextMenu_.clear();
				this.contextMenu_.items = [];
				let dictionaryPathOffset = "context_menu.";
				var menuItem_inspectElement = new MenuItem({
					label: $.i18n.t(dictionaryPathOffset + "STR_CONTEXT_VALIDATE_ELEMENTS"),
					click: () => {
						this.currentWindow_.inspectElement(this.rightClickPosition_.x, this.rightClickPosition_.y);
					}
				});

				var $facePages = $("#face-canvas").find(".face-page");

				var menuItem_gridSize = new MenuItem({   // 当面使わなくなったが将来用に残しておきます
					label: $.i18n.t(dictionaryPathOffset + "STR_CONTEXT_GRID_SIZE"),
					type: "submenu",
					submenu: Menu.buildFromTemplate([
						{
							label: $.i18n.t(dictionaryPathOffset + "STR_CONTEXT_GRID_SIZE_NON"), type: "checkbox", checked: this.gridSize_ === 2 ? true : false, click: () => {
								this._setGridSize(2);
							}
						}, {
							label: $.i18n.t(dictionaryPathOffset + "STR_CONTEXT_GRID_SIZE_8PX"), type: "checkbox", checked: this.gridSize_ === 8 ? true : false, click: () => {
								this._setGridSize(8);
							}
						}, {
							label: $.i18n.t(dictionaryPathOffset + "STR_CONTEXT_GRID_SIZE_16PX"), type: "checkbox", checked: this.gridSize_ === 16 ? true : false, click: () => {
								this._setGridSize(16);
							}
                        }, {
                            label: DEFAULT_GRID + "px", type: "checkbox", checked: this.gridSize_ === DEFAULT_GRID ? true : false, click: () => {
                                this._setGridSize(DEFAULT_GRID);
                            }
                        }, {
							label: $.i18n.t(dictionaryPathOffset + "STR_CONTEXT_GRID_SIZE_32PX"), type: "checkbox", checked: this.gridSize_ === 32 ? true : false, click: () => {
								this._setGridSize(32);
							}
						}, {
							label: $.i18n.t(dictionaryPathOffset + "STR_CONTEXT_GRID_SIZE_64PX"), type: "checkbox", checked: this.gridSize_ === 64 ? true : false, click: () => {
								this._setGridSize(64);
							}
						}
					])
				});


				// カーソルがアイテムの上にある場合は、アイテムの削除を追加
				if (this.$currentTarget_) {
					let menuItem_deleteItem = new MenuItem({
						label: $.i18n.t(dictionaryPathOffset + "STR_CONTEXT_DELETE_ITEM"),
						accelerator: "Delete",
						click: () => {
							// 現在のターゲットとなっているアイテムを削除する
							this._deleteCurrentTargetItem();
						}
					});
					this.contextMenu_.append(menuItem_deleteItem);
					this.contextMenu_.append(new MenuItem({ type: "separator" }));
				} else {
					let $targetPageModule = this._getTargetPageModule(this.rightClickPosition_);
					if ($targetPageModule) {
						if (1 < this.faceRenderer_canvas_.getPageCount()) {
							var menuItem_deletePage = new MenuItem({
								label: $.i18n.t(dictionaryPathOffset + "STR_CONTEXT_DELETE_PAGE"),
								click: () => {
									// ページを削除する
									this._deletePage($targetPageModule);
								}
							});
							this.contextMenu_.append(menuItem_deletePage);
							this.contextMenu_.append(new MenuItem({ type: "separator" }));
						}
					}
				}

				var menuItem_undo = new MenuItem({
					label: $.i18n.t(dictionaryPathOffset + "STR_CONTEXT_UNDO"),
					accelerator: "CmdOrCtrl+Z",
					enabled: this.commandManager_.canUndo() ? true : false,
					click: () => {
						var targetModel = this.commandManager_.undo();
						this._updateItemElementOnCanvas(targetModel);
						// 現在のターゲットを外す
						this._loseTarget();
					}
				});

				var menuItem_redo = new MenuItem({
					label: $.i18n.t(dictionaryPathOffset + "STR_CONTEXT_REDO"),
					accelerator: "CmdOrCtrl+Y",
					enabled: this.commandManager_.canRedo() ? true : false,
					click: () => {
						var targetModel = this.commandManager_.redo();
						this._updateItemElementOnCanvas(targetModel);
						// 現在のターゲットを外す
						this._loseTarget();
					}
				});

				this.contextMenu_.append(menuItem_undo);
				this.contextMenu_.append(menuItem_redo);
				//this.contextMenu_.append(new MenuItem({ type: "separator" }));
				//this.contextMenu_.append(menuItem_gridSize);
                if (DEBUG_MODE) {
                    this.contextMenu_.append(new MenuItem({ type: "separator" }));
                    this.contextMenu_.append(menuItem_inspectElement);
                }

				if (this.contextMenu_.items.length != 0) {
					this.contextMenu_.popup(this.currentWindow_);
				}
			}

			/**
			 * キャンバス内のスクロールイベントのハンドリング
			 */
			private onCanvasPageScrolled(event: Event) {
				console.log("canvas scrolled");
				var $target: JQuery = $(event.currentTarget);
				var scrollTop: number = $target.scrollTop();
				console.log("scrollTop: " + scrollTop);

				var $children = $target.children();

				var scaledFaceHeight = HUIS_FACE_PAGE_HEIGHT / 2;
				var checked = false;
				$children.each((index, elem) => {
					if (checked) {
						return;
					}

					var $elem = $(elem);
					let position = $elem.position();
					if (-(scaledFaceHeight / 2) <= position.top && position.top < (scaledFaceHeight / 2)) {
						this.currentTargetPageIndex_ = parseInt(JQUtils.data($elem, "pageIndex"), 10); //$elem.data("page-index");
						$("#page-index").text((this.currentTargetPageIndex_ + 1) + "");
					}
				});
            }

            /**
			 * パレット内のスクロールイベントのハンドリング
			 */
            private onPalletPageScrolled(event: Event) {
                console.log("onPalletPageScrolled:pallet scrolled");
                var $target: JQuery = $(event.currentTarget);
                var scrollTop: number = $target.scrollTop();
                console.log("onPalletPageScrolled:scrollTop: " + scrollTop);
                this.displayGradationInPalletArea(scrollTop, $target);

                var $children = $target.children();
                var scaledFaceHeight = HUIS_FACE_PAGE_HEIGHT / 2;
              
            }


            private displayGradationInPalletArea(scrollTop: number, $target :JQuery) {

                //最上段の場合、グラデーションを非表示に。それ以外は表示
                if (scrollTop === 0) {
                    $("#pallet-area-gradation-top").css("visibility", "hidden");
                } else {
                    $("#pallet-area-gradation-top").css("visibility", "visible");
                }

                var height: number = $target.height();

                var totalHeight: number = 0;

                $target.children().each((index, elem) => {
                    totalHeight += $(elem).outerHeight();
                }
                );

                if (height < totalHeight) {
                    height = totalHeight;
                }

                var palletHeight = $("#face-pallet").outerHeight();
               
                if (scrollTop > height - palletHeight*2) {
                    $("#pallet-area-gradation-bottom").css("visibility", "hidden");
                } else {
                    $("#pallet-area-gradation-bottom").css("visibility", "visible");
                }

                var maxHeightTargetPx:any = $target.css("max-height");
                var maxHeightTarget:any = maxHeightTargetPx.replace("px", "");
                if (height < maxHeightTarget) {//長さがpalletarea 以下なら、非表示
                    $("#pallet-area-gradation-bottom").css("visibility", "hidden");
                }
            }

			/**
			 * キャンバス内のページ追加ボタンのハンドリング
			 */
			private onAddPageButtonClicked(event: Event) {
				// ページを追加する
				this.faceRenderer_canvas_.addPage();

				this._setGridSize(this.gridSize_);
			}

			/**
			 * キャンバス内のボタンアイテムがHoverされたときのハンドリング
			 */
			private onHoverButtonItemInCanvas(event : Event) {
				var $target = $(event.currentTarget);//Jquery

				this.showButtonInfoTooltip($target);
			}

			/**
			 * キャンバス内のボタンアイテムのHoverが外されたときのハンドリング
			 */
			private onHoverOutButtonItemInCanvas(event: Event) {
				let FUNCTION_NAME = TAG + " : onHoverOutButtonItemInCanvas : ";
				if (event == null) {
					console.warn(FUNCTION_NAME+"event is null");
					return;
				}

				//tooltipの上にいる かつ ボタンの上にいるときは 非表示にしない
				var mousePosition: IPosition = {
					x: event.pageX,
					y: event.pageY
				};
				let $tooltip: JQuery = $("#canvas-tooltip");
				var $target = $(event.currentTarget);//Jquery
				if (!this.isMousePositionOn($tooltip, mousePosition)) {

					//tooltipを非表示にする。
					this.disableButtonInfoTooltip();
				}

				

			}

			//tooltipから離れたとき呼び出されるイベントハンドラ
			private onHoverOutTooltip(event: Event) {
				//tooltiopを非表示にする
				this.disableButtonInfoTooltip();
			}

			/*
			* キャンバス内のボタンの情報表示用ToolTipを非表示にする。
			*/
			private disableButtonInfoTooltip() {
				let FUNCTION_NAME = TAG + " : disableButtonInfoTooltip : ";

				let $tooltip = $("#canvas-tooltip");

				if ($tooltip == undefined) {
					console.warn(FUNCTION_NAME + "$tooltip is undefined");
					return;
				}

				$tooltip.addClass("disable");
			}



			/*
			* キャンバス内のボタンの情報表示用ToolTipを表示する。
			* @param $button : JQuery ツールチップを表示するボタンの JQuery要素
			*/
			private showButtonInfoTooltip($button : JQuery) {
				let FUNCTION_NAME = TAG + " : showButtonInfoTooltip : ";

				if ($button == undefined) {
					console.warn(FUNCTION_NAME + "$target is undefined");
					return;
				}

				let $tooltip: JQuery= $("#canvas-tooltip");
				if ($tooltip == undefined) {
					console.warn(FUNCTION_NAME + "$tooltip is undefined");
					return;
				}

				var buttonModel: TargetModel = this._getItemModel($button, "canvas");

				if (_.isUndefined(buttonModel)) {
					console.warn(FUNCTION_NAME + "buttonModel is Undefined");
					return;
				}

				if (buttonModel.type !== "button") {
					console.warn(FUNCTION_NAME + "$buttonModel is not button model");
					return;
				}

				//ファンクションが取得できるかチェック
				let functions: string[] = this.getFunctions($button);

				if (functions == undefined || functions.length == 0) {
					functions = [];
					functions.push("none");
				}

				//Hoverしたボタンが選択状態だった場合、表示しない。
				if ($button.hasClass("selected")) {
					this.disableButtonInfoTooltip();
					return;
				}
				$tooltip.removeClass("disable");

				//ツールチップ内の文言を代入
				let deviceType: string = this.getButtonDeviceType($button);
				$tooltip.find(".device-type").html(deviceType);

				//ファンクション情報をローカライズ
				let outputFunctionName = functions[0];
				let $functionName:JQuery= $tooltip.find(".function-name");
				$functionName.html(outputFunctionName);
				var localizedString = null;
				if (outputFunctionName !== "none") {
					localizedString = $.i18n.t("button.function." + outputFunctionName);
				} else {
					localizedString = $.i18n.t("button.none.STR_REMOTE_BTN_NONE");
				}
				
				
				var outputString = localizedString;
				if (functions.length > 1) {
					outputString = outputString + " etc.";
				}
				$functionName.html(outputString);

				//#face-pages-areaのscale率を取得
				let buttonTransform = $("#face-pages-area").css("transform").split(",");
				let buttonScale: number = +(buttonTransform[3].replace(" ", ""));

				//ボタンに対して水平センタリング
				this.layoutTargetOnCenterOfBase($tooltip, $button, 1.0, buttonScale);

				//ボタンのしたにレイアウト
				this.layoutTargetOnButtomOfBase($tooltip, $button, 1.0, buttonScale);

				//マイナスマージンを設定
				let tooltipTopMargin: number = +($tooltip.css("margin-top").replace("px", ""));
				$tooltip.offset({ left: $tooltip.offset().left, top: $tooltip.offset().top + tooltipTopMargin });

			}




			/*
			* ボタンのファンクションを取得
			* $button : buttonItemのJQuery要素
			*/
			private getFunctions($button: JQuery) : string[]{
				var FUNCTION_NAME = this.FILE_NAME + " getFunctions :";
				if (_.isUndefined($button)) {
					console.warn(FUNCTION_NAME + "$button is Undefined");
					return;
				}

				var buttonModel:TargetModel = this._getItemModel($button, "canvas");

				if (_.isUndefined(buttonModel)) {
					console.warn(FUNCTION_NAME + "buttonModel is Undefined");
					return;
				}

				var functionNum = 0;

				if (buttonModel.type !== "button") {
					console.warn(FUNCTION_NAME + "$buttonModel is not button model");
					return;	
				}

				var stateNum = buttonModel.button.state.length;
				var fucntions: string[] = [];
				for (var i = 0; i < buttonModel.button.state.length; i++){
					if (buttonModel.button.state[i].action[0]){
						fucntions.push(buttonModel.button.state[i].action[0].code_db.function.toString());

					}
				}

				return fucntions;

			}

			/*
			* ボタンのデバイスタイプを取得
			* @ $button : JQuery デバイスタイプを取得したいボタンのJquery要素
			* @ return : string  デバイスタイプ
			*/
			private getButtonDeviceType($button: JQuery): string{
				var FUNCTION_NAME = this.FILE_NAME + " getButtonDeviceType :";

				if (_.isUndefined($button)) {
					console.warn(FUNCTION_NAME + "$button is Undefined");
					return;
				}

				var buttonModel: TargetModel = this._getItemModel($button, "canvas");

				if (_.isUndefined(buttonModel)) {
					console.warn(FUNCTION_NAME + "buttonModel is Undefined");
					return;
				}

				if (buttonModel.type !== "button") {
					console.warn(FUNCTION_NAME + "$buttonModel is not button model");
					return;
				}


				return	buttonModel.button.state[0].action[0].code_db.device_type.toString();
				
			}

			/*
			* リモコン名のテキストフィールドの値が変わったときに呼び出される
			*/
			private onRemoteNameTextFieldChanged(event: Event) {
				var $target = $(event.currentTarget);
				var value: any = $target.val();
				//禁則文字がある場合、表示を取り消す。
				let filteredString: string = this.getRemovedInhibitionWords(value);
				if (filteredString != value) {
					$target.val(filteredString);
					value = filteredString;
				}
			}

			/**
			 * 詳細編集エリア内のフォームで値の変更があったときに呼び出される。
			 */
			private onItemPropertyChanged(event: Event) {
				var $target = $(event.currentTarget);
				var $parent = $target.parent();

				var key: string = JQUtils.data($parent, "property"); //$parent.data("property");
				if (!key) {
					key = JQUtils.data($target, "property");
				}
				var value: any = $target.val();

				
				//禁則文字がある場合、表示を取り消す。
				let filteredString: string = this.getRemovedInhibitionWords(value);
				if (filteredString != value) {
					$target.val(filteredString);
					value = filteredString;
				}

				if (key.indexOf("state-") === 0) {
					let stateId = parseInt(JQUtils.data($target, "stateId"), 10); //$target.data("state-id");
					this._updateCurrentModelStateData(stateId, key.slice("state-".length), value);
				} else {
					this._updateCurrentModelData(key, value);
				}
			}

			/**
			 * 詳細編集エリア内の select メニューに値の変更があったときに呼び出される。
			 */
			private onItemPropertySelectChanged(event: Event) {
				var $target = $(event.currentTarget);
                if ($target.hasClass("state-action-input") || $target.hasClass("state-action-function")) {
                    this._setButtonStateActionsBySelect($target);
                } else if ($target.hasClass("image-resize-mode") || $target.hasClass("state-image-resize-mode")) {
                    this._setImageResizeModeBySelect($target);
                } else if ($target.hasClass("property-state-text-size") || $target.hasClass("property-text-size")) {
                    this.onItemPropertyChanged(event);//テキストの大きさを変える際の処理
                }
            }

            /**
			 * 詳細編集(ボタン)エリア内の プレビュー内の画像編集ボタンがクリックされたときに呼び出される
             **/
            private onEditImageButtonClicked(event: Event) {
                //popupメニューのテキスト 今後別のファイルにすべき。
                var STR_PROPATY_AREA_EDIT_IMAGE_POPUP_IMAGE = $.i18n.t("edit.property.STR_EDIT_PROPERTY_ITEM_TYPE_IMAGE_BUTTON");
                var STR_PROPATY_AREA_EDIT_IMAGE_POPUP_TEXT = $.i18n.t("edit.property.STR_EDIT_PROPERTY_ITEM_TYPE_TEXT_BUTTON");

                //押下されたボタンのJquery
                var $target = $(event.currentTarget);

                //popのJquery
                var $overflow = this.$page.find("#edit-image-popup"); // ポップアップのjQuery DOMを取得
                var previewBorderWidth :number = +(this.$page.find(".property-state-image-preview").css("border-width").replace("px",""));
                var $editImageBtn = $overflow.find("#command-change-button-image");
                var $editTextBtn = $overflow.find("#command-change-button-text");

                //popupのテキストを更新
                $editImageBtn.find(".menu-item-text").text(STR_PROPATY_AREA_EDIT_IMAGE_POPUP_IMAGE);
                $editTextBtn.find(".menu-item-text").text(STR_PROPATY_AREA_EDIT_IMAGE_POPUP_TEXT);

                var overFlowWidth = $overflow.find(".popup-list").outerWidth(true);

                var popupY = $target.offset().top + $target.height();
                var popupX = $target.offset().left - overFlowWidth + $target.outerWidth()+ previewBorderWidth;

                var options: PopupOptions = {
                    x: 0,
                    y: 0,
                    tolerance: popupY + ",0,0," + popupX,
                    corners: false
                };


                $overflow.popup(options).popup("open").on("vclick", () => {
                    $overflow.popup("close");
                });
            }

			/**
			 * 詳細編集(背景)エリア内の プレビュー内の画像編集ボタンがクリックされたときに呼び出される
             **/
			private onEditImageBackgroundClicked(event: Event) {
				var $target = $(event.currentTarget);
				var imageType: IMAGE_TYPE = IMAGE_TYPE.BACKGROUND_IMAGE;
				this.startEditButtonImage($target, imageType);
			}

			/**
			 * 詳細編集(画像)エリア内の プレビュー内の画像編集ボタンがクリックされたときに呼び出される
             **/
			private onEditImageNonButtonImageClicked(event: Event) {
				var $target = $(event.currentTarget);
				var imageType: IMAGE_TYPE = IMAGE_TYPE.NON_BUTTON_IMAGE;
				this.startEditButtonImage($target, imageType);
			}

			/**
			 * 詳細編集(ボタン)エリア内の プレビュー内の画像編集ボタンで、
			 * 出現したポップアップの中の画像編集ボタンがクリックされたときに呼び出される
             **/
			private onEditImageButtonInPopupClicked(event: Event) {
				var FUNCTION_NAME = "onEditImageButtonInPopupClicked";
				var $target = $(event.currentTarget);
				var imageType: IMAGE_TYPE = IMAGE_TYPE.BUTTON_IMAGE;

				//stateID付きのJQueryObjectをわたす
				var $editButton = this.$page.find("#edit-image-or-text");

				this.startEditButtonImage($editButton, imageType);
			}

			/**
			 * 詳細編集エリア内の プレビュー内の画像編集ボタンで、
			 * 出現したポップアップの中のテキスト編集ボタンがクリックされたときに呼び出される
             **/
			private onEditTextButtonInPopupClicked(event: Event) {
				var FUNCTION_NAME = "onEditTextButtonInPopupClicked";
				var $target = $(event.currentTarget);
				var $editButton = this.$page.find("#edit-image-or-text");
				let stateId = parseInt(JQUtils.data($editButton, "stateId"), 10); //$target.data("state-id");

				//画像を削除 procDeleteをつかうと、無駄な履歴が残るので使わない。
				let targetState = this._getCurrentTargetState(stateId);
				if (!targetState) {
					return;
				}
				// 状態内の image を削除
				targetState.image = null;
				$(".property-state-image .propery-state-image-src input[data-state-id=\"" + stateId + "\"]").val("");
				$(".property-state-image-preview[data-state-id=\"" + stateId + "\"]").css("background-image", "");
				let $textField: JQuery = $(".property-state-text-value[data-state-id=\"" + stateId + "\"]");

				let textInTextFiled: string = $textField.val();

				this._updateCurrentModelStateData(stateId,
					{
						"text": textInTextFiled,
						"path": null,
						"resolved-path": null

					});
				this.setFocusAndMoveCursorToEnd($textField);
			}


            /**
			 * 詳細編集エリア内の select メニューがクリックされたときに呼び出される。
			 */
            private onItemPropertySelectClicked(event: Event) {
                var $target = $(event.currentTarget);
                var $customSelect = $("#face-item-detail-area").find(".custom-select");
				var selectId = $target.find("select").attr("id");
                var $selectMenu = $("#" + selectId + "-listbox");

                var targetWidth = $target.width();
                var targeHeight = $target.height()
                var popupMenuWidth = $selectMenu.outerWidth(true);
                var popupMenuHeight = $selectMenu.outerHeight(true);

                var popupMenuY = $target.offset().top + targeHeight;//popup menuの出現位置は、selectの真下。

                $selectMenu.outerWidth(targetWidth);

				var options: PopupOptions = {
                    x: 0,
                    y: 0,
                    tolerance: popupMenuY + ",0,0," + $target.offset().left,
                    corners: false
                };

                if ((popupMenuY + popupMenuHeight) > innerHeight) { //popup menguがはみ出すとき
					popupMenuY = innerHeight - $target.offset().top;

					options = {
						x: 0,
						y: 0,
						tolerance: "0,0," + popupMenuY + "," + $target.offset().left,
						corners: false
					};
                }

				$selectMenu.popup(options);
			
            }

			/**
			 * 画像参照ボタンをクリックしたときに呼び出される。
			 */
			private onReferImageClicked(event: Event) {
				var $target = $(event.currentTarget);
				var ImageType: IMAGE_TYPE= null;

				if ($target.hasClass("refer-state-image")) {// ボタン内の state の場合
					ImageType = IMAGE_TYPE.BUTTON_IMAGE;
				} else if ($target.hasClass("page-background-src")) { // ページ背景の場合
					ImageType = IMAGE_TYPE.BACKGROUND_IMAGE;
				} else { // 通常の image の場合
					ImageType = IMAGE_TYPE.NON_BUTTON_IMAGE;
				}
				this.startEditButtonImage($target, ImageType);
			}

			/*
			* アイテムの画像変更処理
			* @param $target:Jquery 呼び出した側のJquery
			*/
			private startEditButtonImage($target :JQuery, imageType:IMAGE_TYPE) {
				var options: Util.ElectronOpenFileDialogOptions = {
					properties: ["openFile"],
					filters: [
						{ name: "画像", extensions: ["jpg", "png", "jpeg"] },
					],
					title: PRODUCT_NAME, // Electron uses Appname as the default title
				};

				// 画像ファイルを開く
				electronDialog.showOpenFileDialog(
					options,
					(imageFiles: string[]) => {
						if (!imageFiles || !imageFiles.length) {
							return;
						}

						//画像ファイルダイアログが表示されると、すべてのフォーカスがはずれてKeydownが働かなくなってしまう。
						//そのため、直後にフォーカスを設定しなおす。
						this.$el.focus();

						let imageFilePath = imageFiles[0];
						let remoteId = this.faceRenderer_canvas_.getRemoteId();
						let imageFileExt = path.extname(imageFilePath).toLowerCase();
						if (!((imageFileExt === ".jpg") || (imageFileExt === ".png") || (imageFileExt === ".jpeg"))) {
							// 警告を出す
							console.warn("ONLY jpg, png, jpeg are supported"); 
							let response = electronDialog.showMessageBox({
								type: "error",
								message: $.i18n.t("dialog.message.STR_DAIALOG_ERROR_MESSAGE_LOAD_NON_SUPPORTED_FILE"),
								buttons: [$.i18n.t("dialog.button.STR_DIALOG_BUTTON_OK")],
								title: PRODUCT_NAME,
							});
							return;
						}

						if (miscUtil.checkFileSize(imageFilePath) === Util.MiscUtil.ERROR_SIZE_TOO_LARGE) { // ファイルが大きすぎる
							let response = electronDialog.showMessageBox({
								type: "error",
								message: $.i18n.t("dialog.message.STR_DIALOG_ERROR_IMAGE_FILE_TOO_LARGE_1") + (MAX_IMAGE_FILESIZE / 1000000) + $.i18n.t("dialog.message.STR_DIALOG_ERROR_IMAGE_FILE_TOO_LARGE_2"),
								buttons: [$.i18n.t("dialog.button.STR_DIALOG_BUTTON_OK")],
								title: PRODUCT_NAME,
							});
							console.warn("Image file too large");
							return;
						}

						if ((imageFileExt === ".jpg") || (imageFileExt === ".jpeg")) {
							let result = miscUtil.checkJPEG(imageFilePath);
							if ((result === Util.MiscUtil.ERROR_TYPE_JPEG2000) || (result === Util.MiscUtil.ERROR_TYPE_JPEGLOSSLESS)) {
								// JPEG2000及びJPEG Losslessはサポートしていない警告を出す
								let response = electronDialog.showMessageBox({
									type: "error",
									message: $.i18n.t("dialog.message.STR_DAIALOG_ERROR_MESSAGE_LOAD_JPEG2000_JPEG_LOSSLESS_FILE"),
									buttons: [$.i18n.t("dialog.button.STR_DIALOG_BUTTON_OK")],
									title: PRODUCT_NAME,
								});
								console.warn("JPEG lossless or JPEG2000 are not supported");
								return;
							}
							else if (result === Util.MiscUtil.ERROR_TYPE_NOT_JPEG) { // 拡張子はJPG/JPEGだが中身がJPEGでないものが指定された
								let response = electronDialog.showMessageBox({
									type: "error",
									message: $.i18n.t("dialog.message.STR_DAIALOG_ERROR_MESSAGE_LOAD_BROKEN_FILE"),
									buttons: [$.i18n.t("dialog.button.STR_DIALOG_BUTTON_OK")],
									title: PRODUCT_NAME,
								});
								console.warn("This type of JPEG is not supported");
								return;
							}
							else if (result === Util.MiscUtil.ERROR_FILE_ACCESS) { // 何らかのトラブルでファイルが読めない								
								console.warn("Imega file not found"); // 普通はこないので特にダイアログは出さないで、編集画面にも何も起きない状態に
								return;
							}
						}
						
						if (imageType === IMAGE_TYPE.BUTTON_IMAGE) {// ボタン内の state の場合
							this._reflectImageToButtonState(remoteId, $target, imageFilePath);
						} else if (imageType === IMAGE_TYPE.BACKGROUND_IMAGE) { // ページ背景の場合
							this._reflectImageToImageItem(remoteId, imageFilePath, true);
						} else { // 通常の image の場合
							this._reflectImageToImageItem(remoteId, imageFilePath);
						}
					}
				);
			}


			/**
			 * 詳細編集エリア内の画像削除ボタンを押したときに呼ばれる。
			 */
			private onDeleteImageClicked(event: Event) {
				var $target = $(event.currentTarget);
				this.procDeleteImage($target);
				this._updatePreviewInDetailArea("none", $("#property-image-preview"));
			}

			/*
			* 画像の削除処理
			*/
			private procDeleteImage($target: JQuery) {

				if ($target.hasClass("delete-state-image") || $target.hasClass("property-state-value")) {
					let stateId = parseInt(JQUtils.data($target, "stateId"), 10);
					if (_.isUndefined(stateId)) {
						return;
					}
					let targetState = this._getCurrentTargetState(stateId);
					if (!targetState) {
						return;
					}
					// 状態内の image を削除
					targetState.image = null;
					this._updateCurrentModelStateData(stateId, {
						"path": null,
						"resolved-path": null
					});

					//this._updateCurrentModelStateData(stateId, "path", null);
					//this._updateCurrentModelStateData(stateId, "resolved-path", null);
					$(".property-state-image .propery-state-image-src input[data-state-id=\"" + stateId + "\"]").val("");
					$(".property-state-image-preview[data-state-id=\"" + stateId + "\"]").css("background-image", "");
				} else if ($target.attr("id") === "delete-background-image") {
					// 背景画像の削除
                    $(".property-value.page-background-src").val("");
					$("#property-image-preview").css("background-image", "none");
					this._updateCurrentModelData("path", "");
					this._updateCurrentModelData("enabled", false);
				}
				
			}

			/**
			 * 画像アイテムに指定した画像を反映させる
			 */
			private _reflectImageToImageItem(remoteId: string, imageFilePath: string, pageBackground?: boolean) {
				let imageFileName = path.basename(imageFilePath);
				//let $propImage = $("#property-image");
				//if (pageBackground) {
				//	$propImage.find("#propery-page-background-image-src>.property-value").val(imageFileName);
				//} else {
				//	$propImage.find("#propery-image-src>.property-value").val(imageFileName);
				//}


				/* model の更新 */

				// 画像は remoteimages/[remoteId]/ 以下に配置される。
				// image.path には remoteimages 起点の画像パスを指定する。
				var imagePath = path.join(remoteId, imageFileName).replace(/\\/g, "/");
				let model = <Model.ImageItem>this._updateCurrentModelData({
					"path": imagePath,
					"resizeOriginal": imagePath
				});
				// face ディレクトリ内に配置されるべき画像のパスを取得
				let resolvedPath = model.resolvedPath;
				// 画像を face ディレクトリ内にコピー
				// 画像のリサイズとグレースケール化
				Model.OffscreenEditor.editImage(imageFilePath, pageBackground ? IMAGE_EDIT_PAGE_BACKGROUND_PARAMS : IMAGE_EDIT_PARAMS, resolvedPath)
					.done((editedImage) => {
						// 画像編集後に出力パスが変わる場合があるので、再度 model 更新
						let editedImageName = path.basename(editedImage.path);
						let editedImagePath = path.join(remoteId, editedImageName).replace(/\\/g, "/");
						if (pageBackground) {
							// pageBackground の場合、画像の指定がないときは disabled になっているので enabled にする
							this._updateCurrentModelData({
								"enabled": true,
								"path": editedImagePath,
								"resizeOriginal": editedImagePath,
								"resized": true
							});
						} else {
							this._updateCurrentModelData({
								"path": editedImagePath,
								"resizeOriginal": editedImagePath,
								"resized": true
							});
						}
						
					});
			}

			private _reflectImageToButtonState(remoteId: string, $target: JQuery, imageFilePath: string) {
				let imageFileName = path.basename(imageFilePath);
				let stateId = parseInt(JQUtils.data($target, "stateId"), 10); //$target.data("state-id");
				if (_.isUndefined(stateId)) {
					return;
				}

				let targetState = this._getCurrentTargetState(stateId);
				if (!targetState) {
					return;
				}
				if (!targetState.image) {
					targetState.image = [];
				}
				if (targetState.image.length < 1) {
					targetState.image.push({
						areaRatio: {
							x: 0, y: 0, w: 1, h: 1
						},
						path: ""
					});
				}
				// 画像は remoteimages/[remoteId]/ 以下に配置される。
				// image.path には remoteimages 起点の画像パスを指定する。
				var image = targetState.image[0];
				image.path = path.join(remoteId, imageFileName).replace(/\\/g, "/");
				// resolvedPath ( [HUIS_FILES_ROOT]/[remoteId]/imageName)
				let resolvedPath = path.resolve(path.join(HUIS_FILES_ROOT, "remoteimages", image.path)).replace(/\\/g, "/");
				image.resolvedPath = resolvedPath;
				// 画像のリサイズとグレースケール化
				Model.OffscreenEditor.editImage(imageFilePath, IMAGE_EDIT_PARAMS, resolvedPath)
					.done((editedImage) => {
						// 画像編集後に出力パスが変わる場合があるので、再度 model 更新
						let editedImageName = path.basename(editedImage.path);
						let editedImagePath = path.join(remoteId, editedImageName).replace(/\\/g, "/");
						this._updateCurrentModelStateData(stateId, {
							"path": editedImagePath,
							"resolved-path": editedImage.path.replace(/\\/g, "/"),
							"resizeOriginal": editedImagePath,
							"text":""
						});

						

						// テキストエリアの文字表示をアップデート
						$(".property-state-text-value[data-state-id=\"" + stateId + "\"]").val("");

						//this._updateCurrentModelStateData(stateId, "path", editedImagePath);
						//this._updateCurrentModelStateData(stateId, "resolved-path", editedImage.path.replace(/\\/g, "/"));
					});
			}

			/**
			 * ボタンアイテムの詳細編集エリア内の状態追加ボタンを押したときに呼び出される
			 */
			private onAddButtonStateClicked(event: Event) {
				if (!this.currentTargetModel_ || !this.currentTargetModel_.button) {
					return;
				}

				var button = this.currentTargetModel_.button;
				var states = button.state;
				var newStateId = 0;
				if (states) {
					// 未使用の stateId を探す
					let sortedStates = states.sort((state1, state2) => {
						return state1.id - state2.id;
					});
					sortedStates.forEach((state) => {
						if (newStateId === state.id) {
							newStateId++;
						}
					});
				}
				var newState: IState = {
					id: newStateId
				};

				if (!this.currentTargetButtonStates_) {
					this.currentTargetButtonStates_ = [];
				}
				this.currentTargetButtonStates_.push({
					id: newStateId
				});
				this.currentTargetButtonStatesUpdated_ = true;

				this._updateCurrentModelButtonStatesData();
				this._showDetailItemArea(this.currentTargetModel_);
			}

			/**
			 * ボタンアイテムの詳細編集エリア内の状態削除ボタンを押したときに呼び出される
			 */
			private onRemoveButtonStateClicked(event: Event) {
				if (!this.currentTargetModel_ || !this.currentTargetModel_.button || !this.currentTargetButtonStates_) {
					return;
				}

				var $target = $(event.currentTarget);
				var stateId = parseInt(JQUtils.data($target, "stateId"), 10); //$target.data("state-id");
				if (_.isUndefined(stateId)) {
					return;
				}

				// stateId と一致する state を検索し、削除する
				var targetStateIndex = -1;
				for (let i = 0, l = this.currentTargetButtonStates_.length; i < l && targetStateIndex < 0; i++) {
					let state = this.currentTargetButtonStates_[i];
					if (state.id === stateId) {
						targetStateIndex = i;
					}
				}
				if (targetStateIndex < 0) {
					return;
				}

				this.currentTargetButtonStates_.splice(targetStateIndex, 1);
				this.currentTargetButtonStatesUpdated_ = true;

				this._updateCurrentModelButtonStatesData();
				this._showDetailItemArea(this.currentTargetModel_);

			}

            /**
            * 戻るボタンが押されたときに呼び出される
            */
            private onBackButtonClicked(event: Event) {
				$("#button-edit-back").prop("disabled", true);	// 二度押し対策

				let response = electronDialog.showMessageBox(
					{
						type: "warning",
						message: $.i18n.t("dialog.message.STR_DIALOG_MESSAGE_WARN_NONSAVE"),
						buttons: [
							$.i18n.t("dialog.button.STR_DIALOG_BUTTON_SAVE"),
							$.i18n.t("dialog.button.STR_DIALOG_BUTTON_NOT_SAVE"),
							$.i18n.t("dialog.button.STR_DIALOG_BUTTON_CANCEL"),
						],
						cancelId: 2,
						title: PRODUCT_NAME,
					});

				if (response === 0) {// positiveなボタンの場合,Saveと同じ処理
					this.onEditDoneButtonClicked(event);
				} else if (response === 1) {
					Framework.Router.back();//negative なボタンの場合、homeに戻る
				} else {//キャンセル処理の場合、なにもしない。
				}

				$("#button-edit-back").prop("disabled", false);
           }

			/*
			* リモコン名編集用のテキストフィールドをクリックした際に呼び出し
			*/
			private onRemoteNameTextFieldClicked(event: Event) {
				//リモコン名編集するときには、ほかのターゲットをはずす。
				this._loseTarget();
				$(event.currentTarget).focus();
			}

			/**
			 * 編集完了ボタンを押したときに呼び出される
			 */
			private onEditDoneButtonClicked(event: Event) {
				$("#button-edit-done").prop("disabled", true); // 二度押し対策

				// 直前に選択されていたボタンの状態更新があれば行う
				this._updateCurrentModelButtonStatesData();

				// 現在のターゲットを外す
				this._loseTarget();

				var options: Util.ElectronMessageBoxOptions = {
				
				};

				let gmodules = this.faceRenderer_canvas_.getModules();
				let remoteId = this.faceRenderer_canvas_.getRemoteId();
				let faceName: string = $("#input-face-name").val();
				if (!faceName) {
					let response = electronDialog.showMessageBox({
						type: "error",
						message: $.i18n.t("dialog.message.STR_DIALOG_MESSAGE_ALERT_NO_REMOTE_NAME"),
						buttons: [$.i18n.t("dialog.button.STR_DIALOG_BUTTON_OK")],
						title: PRODUCT_NAME,
					});
					if (response === 0) {
						//テキストフィールドにフォーカス
						var $remoteName: JQuery = $("#input-face-name");
						this.setFocusAndMoveCursorToEnd($remoteName);
					}
					return;
				}
				let overlapButtonError = this._overlapButtonsExist();
				if (overlapButtonError) {
					electronDialog.showMessageBox({
						type: "error",
						message: $.i18n.t("dialog.message.STR_DIALOG_MESSAGE_WARN_OVERLAP")
						+ overlapButtonError,
						buttons: [$.i18n.t("dialog.button.STR_DIALOG_BUTTON_OK")],
						title: PRODUCT_NAME,
					});
					return;
				}
				huisFiles.updateFace(remoteId, faceName, gmodules)
					.always(() => {
						garageFiles.addEditedFaceToHistory("dev" /* deviceId は暫定 */, remoteId);
						if (HUIS_ROOT_PATH) {
							let syncTask = new Util.HuisDev.FileSyncTask();
							let syncProgress = syncTask.exec(HUIS_FILES_ROOT, HUIS_ROOT_PATH, true, DIALOG_PROPS_CREATE_NEW_REMOTE, null, (err) => {
								if (err) {
									// [TODO] エラー値のハンドリング
									electronDialog.showMessageBox({
										type: "error",
										message: $.i18n.t("dialog.message.STR_DIALOG_MESSAGE_SYNC_WITH_HUIS_ERROR"),
										buttons: [$.i18n.t("dialog.button.STR_DIALOG_BUTTON_OK")],
										title: PRODUCT_NAME,
									});
								} else {
									//CDP.this.showGarageToast"HUIS との同期が完了しました。"); 使われてない？
									Framework.Router.back();
								}
								$("#button-edit-done").prop("disabled", false);

							});
						} else {
							//this.showGarageToast("リモコンを保存しました。");　使われてない
							Framework.Router.back();
							$("#button-edit-done").prop("disabled", false);
					}
				});
			}


			/**
			 * 現在のターゲットとなるモデルに対して、データをセットする。
			 * 
			 * @param key {string} データのキー
			 * @param value {any} 値
			 * @return {any} 現在のターゲットとなるモデル
			 */
			private _updateCurrentModelData(key: string, value: any): ItemModel;

			/**
			 * 現在のターゲットとなるモデルに対して、データをセットする。
			 * 
			 * @param properties {Object} データのキーとバリューのセット
			 * @return {any} 現在のターゲットとなるモデル
			 */
			private _updateCurrentModelData(properties: any): ItemModel;

			private _updateCurrentModelData(param1: any, param2?: any): ItemModel {
				if (!this.currentTargetModel_) {
					console.warn(TAG + "_updateCurrentModelData() target model not found");
					return;
				}
				var model = null;
				switch (this.currentTargetModel_.type) {
					case "button":
						model = this.currentTargetModel_.button;
						break;

					case "label":
						model = this.currentTargetModel_.label;
						break;

					case "image":
						model = this.currentTargetModel_.image;
						break;

					default:
				}

				if (!model) {
					console.warn(TAG + "_updateCurrentModelData() target model not found");
					return null;
				}

				/**
				 * undo / redo 対応のために、CommandManager 経由で model の更新を行う
				 */
				var previousData = {};
				var nextData = {};
				if (_.isString(param1)) {
					let key = param1;
					let value = param2;
					previousData[key] = model[key];
					nextData[key] = value;
				} else if (_.isObject(param1)) {
					let properties: Object = param1;
					let keys = Object.keys(properties);
					keys.forEach((key) => {
						previousData[key] = model[key];
						nextData[key] = properties[key];
					});
                }

				var memento: IMemento = {
					target: model,
					previousData: previousData,
					nextData: nextData
				};

				var mementoCommand = new MementoCommand(memento);
				this.commandManager_.invoke(mementoCommand);

				// 更新内容を DOM に反映
				this._updateItemElementOnCanvas(model);

				return model;

			}

			/**
			 * canvas 上にあるアイテムの要素に対して、表示の更新を行う
			 * 
			 * @param targetModel {ItemModel} アイテム要素の表示更新の対象となる model
			 */
			private _updateItemElementOnCanvas(targetModel: ItemModel) {

				let FUNCTION_NAME = TAG + " : _updateItemElementOnCanvas : ";

				let $target = this._getItemElementByModel(targetModel);
				if (targetModel.enabled) {
					$target.removeClass("disabled");
				} else {
					$target.addClass("disabled");
				}

				//backgroundImageか否か
				let isBackground: boolean = $target.hasClass("background");

				// model の各プロパティーに対して、CSS 設定等で表示を更新する
				let itemType = targetModel.itemType;
				let keys = targetModel.properties;
				keys.forEach((key) => {
					var value = targetModel[key];
					if (!value) {
						//console.warn(TAG + "_updateItemElementOnCanvas() model." + key + "is not found.")
						return;
					}

					switch (key) {
						case "text":
							$target.find(".label-value").text(value);
							break;

						case "size":
							//HUISに表示したとき、Garageでみるより小さく表示されるため、Garageでの表示に補正を加える。
							if (itemType == "button") {
								value = (value * RATIO_TEXT_SIZE_HUIS_GARAGE_BUTTON);
							} else if (itemType == "label") {
								value = (value * RATIO_TEXT_SIZE_HUIS_GARAGE_LABEL);
							}
							
							$target.css("font-size", value + "pt");
							break;

						case "color":
							// 16階調グレースケールを RGB 変換して CSS に設定
							var resolvedColor = targetModel["resolvedColor"];
							if (resolvedColor) {
								$target.css("color", resolvedColor);
							}
							break;

						case "path":
							{
								// 設定された background-image をリセットしておく
								$target.css("background-image", "none");

								// image.garageExtension.original のパスを優先的に使う。
								// 存在しない場合は、image.path を使う。
								let resolvedPath = targetModel["resizeResolvedOriginalPath"];

								if (!resolvedPath || resolvedPath == HUIS_REMOTEIMAGES_ROOT) {
									resolvedPath = targetModel["resolvedPath"];
								}

								// 画像のロードが完了してから表示を更新する
								let img = new Image();
								img.onload = () => {
									$target.css("background-image", "url(" + resolvedPath + ")");
									// 詳細編集エリアの画像ファイルパス名を更新
									let path = targetModel["resizeOriginal"];
									if (!path) {
										path = targetModel["path"];
									}
									$("#refer-image").val(path);
									// 詳細編集エリアのプレビュー部分の更新
                                    this._updatePreviewInDetailArea(resolvedPath, $("#property-image-preview"), isBackground);
								};
								img.src = resolvedPath;

							}
							break;

						case "area":
							{
								// 座標とサイズを変更
								let cssParams: any = {
									left: value.x + "px",
									top: value.y + "px",
									width: value.w + "px",
									height: value.h + "px"
								};
								if (itemType === "label") {
									cssParams.lineHeight = value.h + "px";
								}
								$target.css(cssParams);

								// ターゲットがボタンの場合、state 内にある画像・ラベルのリサイズを行う
								if (itemType === "button") {
                                    this._resizeButtonStateItem($target, value);
								}
							}
							break;

                        case "resizeMode":
                            {
                                switch (value) {
                                    case "contain":
                                        $target.removeClass("image-stretch")
                                            .removeClass("image-cover");
                                        break;

                                    case "cover":
                                        $target.addClass("image-cover")
                                            .removeClass("image-stretch");
                                        break;

                                    case "stretch":
                                        $target.addClass("image-stretch")
                                            .removeClass("image-cover");
                                        break;

                                    default:
                                        $target.removeClass("image-stretch")
                                            .removeClass("image-cover");
                                }
                            }
                            break;

						case "resizeOriginal":
							{
								let resolvedOriginalPath = targetModel["resizeResolvedOriginalPath"];
								if (resolvedOriginalPath) {
									// 画像のロードが完了してから表示を更新する
									let img = new Image();
									img.onload = () => {
										$target.css("background-image", "url(" + resolvedOriginalPath + ")");


										// プレビュー部分の更新
                                        this._updatePreviewInDetailArea(resolvedOriginalPath, $("#property-image-preview"), isBackground);
                                    };
                                    if ($("#property-image-preview").css("background-image") !== "none") { // 削除されている場合はそのまま
                                        img.src = resolvedOriginalPath;
                                    }
								}
							}
							break;
						case "state": //ボタンの画像などを変更した際の、変更
							{
								if (itemType === "button") {
									let targetButton :IGButton = $.extend(true, {}, targetModel);
									var states = value;

									//ターゲットのstateIdはモデルに記載されているdefault値、もし値がない場合0に。
									let stateId: number = targetButton.default;

									var currentStates: IGState[] = $.extend(true, [], states);

									let targetStates: IGState[];
									if (_.isUndefined(stateId)) {
										// stateId が指定されていない場合は、全 state を更新
										targetStates = states;
									} else {
										targetStates = states.filter((state) => {
											return state.id === stateId;
										});
									}

									if (!targetStates || targetStates.length < 1) {
										console.warn(FUNCTION_NAME + "state id is not found");
										return;
									}

									// state id は重複することはないが、もし複数の state が見つかった場合は、最初の state をターゲットとする
									var $targetStateElem = $target.find(".button-state").filter((index: number, elem: Element) => {
										return parseInt(JQUtils.data($(elem), "stateId"), 10) === stateId;
									});
									if (!$targetStateElem || $targetStateElem.length < 1) {
										console.warn(FUNCTION_NAME + "target state elem is not found");
										return;
									}

									let buttonW = targetButton.area.w;
									if (buttonW == null) {
										console.warn(FUNCTION_NAME + "buttonW is null");
										return;
									}

									let buttonH = targetButton.area.h;
									if (buttonH == null) {
										console.warn(FUNCTION_NAME + "buttonH is null");
										return;
									}

									

									targetStates.forEach((targetState: IGState) => {

										//"text", "size", "path", "resolved-path", "resizeMode"すべてが変化したとみなす。
										let props = {};

										let label = targetState.label;
										props["text"] = "";
										if (label != null) {
											if (label[0] != null){
												let text = label[0].text;
												if (text != null) {
													props["text"] = text;
												}

												let size = label[0].size;
												if (size != null) {
													props["size"] = size;
												}
											}
										}

										let image = targetState.image;
										props["resolved-path"] = "null";
										if (image != null) {
											if (image[0] != null) {
												let resolvedPath = image[0].resolvedPath;
												if (resolvedPath != null) {
													props["resolved-path"] = resolvedPath;
												}

												let resizeMode = image[0].resizeMode;
												if (resizeMode != null) {
													props["resizeMode"] = resizeMode;
												}
											}
											
										}

										let keys = Object.keys(props);
										keys.forEach((key) => {
											let value = props[key];
											this.updateButtonOnCustom(stateId, key, value, targetState, $targetStateElem, buttonW, buttonH);
										});
									});
								}
							}
							break;
					}

					
				});
			}


            /**
            * 詳細設定エリアのプレビューの画像を更新する
            */
            private _updatePreviewInDetailArea(imagePath : string, $preview, isBackground? : boolean) {
                if (imagePath == undefined) {
                    console.log("FullCustom.ts:_updatePreviewInDetailArea:imagePath is Undefined");
					return;
                }

                if ($preview == undefined) {
                    console.log("FullCustom.ts:_updatePreviewInDetailArea:$previewId is Undefined");
					return;
                }

				if (isBackground == undefined) {
					isBackground = false;
				}

				let previewHeight: number = MIN_HEIGHT_PREVIEW;
				if (imagePath != HUIS_REMOTEIMAGES_ROOT
					&& imagePath != "") {
					$preview.css("background-image", "url(" + imagePath + ")");
					let previewWidth = $preview.width();
					let img = new Image();
					img.src = imagePath;
					let imgWidth = img.width;
					let imgHeight = img.height;
					previewHeight = imgHeight * (previewWidth / imgWidth);

					//previewHeight = Nanのときもあるので MIN_HEIGHT_PREVIEW > previewHeightではない。
					if (!(MIN_HEIGHT_PREVIEW < previewHeight)) {
						previewHeight = MIN_HEIGHT_PREVIEW;
					}

					if (isBackground) {
						previewHeight = REMOTE_BACKGROUND_HEIGHT * (previewWidth / REMOTE_BACKGROUND_WIDTH);
					}
				}

                $preview.height(previewHeight);
           }
            

			/**
			 * データとして持っている state のリストを Button Model に更新する
			 */
			private _updateCurrentModelButtonStatesData() {
				if (!this.currentTargetModel_ || !this.currentTargetModel_.button || !this.currentTargetButtonStates_) {
					return;
				}
				// 更新がない場合は何もしない
				if (!this.currentTargetButtonStatesUpdated_) {
					return;
				}

				var button = this.currentTargetModel_.button;

				// ボタンにひも付けられている機器の情報を取得
				var deviceInfo = button.deviceInfo;
				var brand: string,
					device_type: string,
					db_codeset: string,
					model_number: string,
					functions: string[],
					functionCodeHash: IStringStringHash;
				if (deviceInfo && deviceInfo.code_db) {
					brand = deviceInfo.code_db.brand;
					device_type = deviceInfo.code_db.device_type;
					db_codeset = deviceInfo.code_db.db_codeset;
					model_number = deviceInfo.code_db.model_number;
					if (deviceInfo.functionCodeHash){
						functionCodeHash = deviceInfo.functionCodeHash;
					}
				}

				

				var currentStates: IState[] = $.extend(true, [], button.state);
				// 更新後の button states を作成する
				var newStates: IState[] = [];
				this.currentTargetButtonStates_.forEach((stateDetail: IStateDetail) => {
					// 対象となる id の states にフィルタリング
					let targetState = currentStates.filter((state) => {
						return state.id === stateDetail.id;
					});
					if (targetState.length < 1) {
						targetState = null;
					}
					var actionList = stateDetail.actionList;
					

					if (actionList) {
						var actions: IAction[] = [];
						for (let key in actionList) {
							if (!key) {
								continue;
							}
							let value: string = actionList[key];
							if (_.isUndefined(value) || value === "none") {
								continue;
							}
							
							let codeDb: ICodeDB = {
								function: value,
								brand: brand,
								device_type: device_type,
								db_codeset: db_codeset,
								model_number: model_number
							};


							let action: IAction = {
								input: key,
								code_db: codeDb
							};

							
							//このFunctionに登録されているaction/code を取得する。
							if (functionCodeHash != undefined) {
								let code: string = functionCodeHash[value];
								//codeがある場合は actionに登録する。
								if (code != null) {
									action = {
										input: key,
										code_db: codeDb,
										code: code,
									};
								}
							}
						

							actions.push(action);
							
						}

						//アクションが一つもない場合、actionが空のボタンにする。
						if (actions != undefined && actions.length == 0) {
							let codeDb: ICodeDB = {
								function: "none",
								brand: brand,
								device_type: device_type,
								db_codeset: db_codeset,
								model_number: model_number
							};
							let action: IAction = {
								input: "none",
								code_db: codeDb
							};
							actions.push(action);
						}

					}

					var translates: IStateTranslate[] = [];
					var actionListTranslate = stateDetail.actionListTranslate;
					if (actionListTranslate) {
						var actionsTranslate: IAction[] = [];
						for (let key in actionListTranslate) {
							if (!key) {
								continue;
							}
							let value: string = actionListTranslate[key];
							if (_.isUndefined(value) || value === "none") {
								continue;
							}
							if (value.indexOf("translate-state-") === 0) {
								let stateId: number = parseInt(value.replace("translate-state-",""));
								let translate: IStateTranslate = {
									input: key,
									next: stateId
								};
								translates.push(translate);
							} 
						}
					}

					let state: IState = {
						id: stateDetail.id,
						image: targetState ? targetState[0]["image"] : stateDetail.image,
						label: targetState ? targetState[0]["label"] : stateDetail.label,
						action: actions && 0 < actions.length ? actions : undefined,
						translate: translates && 0 < translates.length ? translates : undefined
					};
					newStates.push(state);
				});

				// 状態を更新する
				var memento: IMemento = {
					target: button,
					previousData: { "state": currentStates },
					nextData: { "state": newStates }
				};
				var mementoCommand = new MementoCommand(memento);
				this.commandManager_.invoke(mementoCommand);

				this.currentTargetButtonStatesUpdated_ = false;
			}

			/**
			 * 現在ターゲットとなっているボタン内の「状態」にデータをセットする
			 *
			 * @param stateId {number} データをセットする状態の ID。undefined の場合は、全 state を更新。
			 * @param key {string} データのキー
			 * @param value {any} 値
			 */
			private _updateCurrentModelStateData(stateId: number, key: string, value);

			/**
			 * 現在ターゲットとなっているボタン内の「状態」にデータをセットする
			 *
			 * @param stateId {number} データをセットする状態の ID。undefined の場合は、全 state を更新。 
			 * @param properties {Object} キーと値のセット
			 */
			private _updateCurrentModelStateData(stateId: number, properties: any);

            private _updateCurrentModelStateData(stateId: number, param1: any, param2?: any) {

				if (!this.currentTargetModel_) {
					console.warn(TAG + "_updateCurrentModelStateData() target model is not found");
					return;
				}
				if (this.currentTargetModel_.type === "button" && !this.currentTargetModel_.button) {
					console.warn(TAG + "_updateCurrentModelStateData() target model is not button item");
					return;
				}

              

				/**
				 * state 内に label が存在しない場合に、補完する
				 */
				var solveLabel = function (state: IGState) {
					var defaltTextSize = 30;
					var $targetTextSizePullDown: JQuery = $(".property-state-text-size[data-state-id=\"" + stateId + "\"]");

					if ($targetTextSizePullDown) {
						defaltTextSize = +($targetTextSizePullDown.val());
					}

					if (!state.label || !state.label.length) {
						state.label = [{
							areaRatio: {
								x: 0, y: 0, w: 1, h: 1
							},
							text: "",
							size: defaltTextSize,
							font_weight: FontWeight.FONT_BOLD
						}];
					}
				};	

				/**
				 * state 内に image が存在しない場合に、補完する
				 */
				var solveImage = function (state: IGState) {
					if (!state.image || !state.image.length) {
						state.image = [{
							areaRatio: {
								x: 0, y: 0, w: 1, h: 1
							},
							path: ""
						}];
					}
				};

				let props: Object;
				if (_.isString(param1)) {
					props = {};
					props[param1] = param2;
				} else if (_.isObject(param1)) {
					props = param1;
				} else {
					console.warn(TAG + "_updateCurrentModelStateData() unknown type param");
					return;
                }

				var button = this.currentTargetModel_.button;
				var states = button.state;
				if (!states) {
					console.warn(TAG + "_updateCurrentModelStateData() state is not found in button");
					return;
				}
				var currentStates: IGState[] = $.extend(true, [], states);

				let targetStates: IGState[];
				if (_.isUndefined(stateId)) {
					// stateId が指定されていない場合は、全 state を更新
					targetStates = states;
				} else {
					targetStates = states.filter((state) => {
						return state.id === stateId;
					});
				}

				if (!targetStates || targetStates.length < 1) {
					console.warn(TAG + "_updateCurrentModelStateData() state id is not found");
					return;
				}

				// state id は重複することはないが、もし複数の state が見つかった場合は、最初の state をターゲットとする
				var targetState = targetStates[0];
				var $targetStateElem = this.$currentTarget_.find(".button-state").filter((index: number, elem: Element) => {
					return parseInt(JQUtils.data($(elem), "stateId"), 10) === stateId;
				});
				if (!$targetStateElem || $targetStateElem.length < 1) {
					console.warn(TAG + "_updateCurrentModelStateData() target state elem is not found");
					return;
				}


                

				targetStates.forEach((targetState: IGState) => {

					let keys = Object.keys(props);
					keys.forEach((key) => {
						let value = props[key];
						// データの更新
						switch (key) {
							case "text":
								solveLabel(targetState);
								targetState.label[0].text = value;
								//$targetStateElem.find(".state-label").text(value);
								break;

							case "size":
								solveLabel(targetState);
								
								if (isFinite(value)) {//numberでない場合、numberに変換。
									value =+ (value);
								}

								targetState.label[0].size = value;
								//$targetStateElem.find(".state-label").css("font-size", value + "pt");
								break;

							case "path":
								if (value) {
									solveImage(targetState);
									targetState.image[0].path = value;
								} else {// 未指定の場合は削除
									targetState.image = null;
								}
								break;

							case "resolved-path":
								if (value) {
									solveImage(targetState);
									targetState.image[0].resolvedPath = value;
								} else {
									targetState.image = null;
								}
								break;

							case "resizeOriginal":
								if (value) {
									solveImage(targetState);
									targetState.image[0].resizeOriginal = value;
								}
								break;

							case "resizeMode":
								if (value) {
									solveImage(targetState);
									targetState.image[0].resizeMode = value;
								}
								break;

							case "resized":
								if (value) {
									solveImage(targetState);
									targetState.image[0].resized = true;
								}
								break;

							default:

						}

						this.updateButtonOnCustom(stateId, key, value, targetState, $targetStateElem, button.area.w, button.area.h);

					
					});
				});

				

				var memento: IMemento = {
					target: button,
					previousData: { "state": currentStates },
					nextData: { "state": states }
				};
				var mementoCommand = new MementoCommand(memento);
				this.commandManager_.invoke(mementoCommand);

			}

			/*
			*  button のcanvas 上のスタイルと詳細エリアの更新する
			*  @param stateId {number} buttonのステートID
			*  @param key{string} update対象の種類 "text", "size" など
			*  @param value 変更量
			*  @$targetStateElem {JQuery} 対象のJQuery要素
			*  @buttonAreaW{number} 変更対象のボタンのW
			*  @buttonAreaH{number} 変更対象のボタンのH
			*/
			private updateButtonOnCustom(stateId: number, key: string, value, targetState: IGState, $targetStateElem:JQuery, buttonAreaW : number, buttonAreaH :number) {
					// canvas 上のスタイルと詳細エリアの更新
						switch (key) {
							case "text":
							case "size":
								{
								
									let $labelElement = $targetStateElem.find(".state-label");
									let label = targetState.label[0];
									if (label == null) {
										break;
									}
									$labelElement.text(label.text);
									$labelElement.css({
										left: "0",
										top: "0",
										width: buttonAreaW + "px",
										height: buttonAreaH + "px",
										lineHeight: buttonAreaH + "px",
										color: "rgb(0,0,0)",
										fontSize: (label.size * RATIO_TEXT_SIZE_HUIS_GARAGE_BUTTON) + "pt"
									});

									//画像が存在するとき、テキストEdit機能を非表示にする
									this.toggleImagePreview(stateId);

									//テキストエリアが表示されたとき、フォーカスを移す。
									var $textFieldInPreview = $(".property-state-text-value[data-state-id=\"" + stateId + "\"]");
									if ($textFieldInPreview.css("visibility") === "visible") {
										setTimeout(function () {
											$textFieldInPreview.focus();
										}, 0);
									}

								}
								break;

							case "path":
								{
									// 詳細エリアの画像パス名を更新
									let $input = $(".refer-state-image[data-state-id=\"" + stateId + "\"]");
									$input.val(value);
								}
								break;
							case "resolved-path":
								{
									//let image = targetState.image[0];
									let $imageElement = $targetStateElem.find(".state-image");
									$imageElement.css({
										left: "0",
										top: "0",
										width: buttonAreaW + "px",
										height: buttonAreaH + "px",
										backgroundImage: value ? "url(" + value + ")" : "none"
									});
									// 画像のロードが完了してから表示を更新する
									let img = new Image();
									img.onload = () => {
										// 詳細エリアのプレビュー更新
										let $preview = $(".property-state-image-preview[data-state-id=\"" + stateId + "\"]");
										this._updatePreviewInDetailArea(value, $preview);


										//画像が存在するとき、テキストEdit機能を非表示にする
										this.toggleImagePreview(stateId);

									};
									img.src = value;
									
                                    //$preview.css("background-image", value ? "url('" + value + "')": "none");

								}
								break;
							case "resizeMode":
								{
									let $imageElement = $targetStateElem.find(".state-image");
									switch (value) {
										case "contain":
											$imageElement.removeClass("image-stretch")
												.removeClass("image-cover");
											break;
										case "cover":
											$imageElement.addClass("image-cover")
												.removeClass("image-stretch");
											break;
										case "stretch":
											$imageElement.addClass("image-stretch")
												.removeClass("image-cover");
											break;
										default:
											$imageElement.removeClass("image-stretch")
												.removeClass("image-cover");
									}
								}
								break;
						}
			}


			/*
			* ボタン画像がある場合、テキストエリアを表示に。する
			*/
			private toggleImagePreview(stateId: number) {
				let FUNCTION_NAME = TAG + " :toggleImagePreview: ";

				var $preview = $(".property-state-image-preview[data-state-id=\"" + stateId + "\"]");
				if ($preview == null) {
					//redo, undoの際に、previewが表示されていない場合がある。
					return;
				}

				var $textFieldInPreview = $preview.find(".text-field-in-preview");
				if ($textFieldInPreview == null) {
					console.warn(FUNCTION_NAME + "$textFieldInPreview is undefined");
					return;
				}

				//cssのbackgroundImage要素から、画像名を抽出
				let previceBagroundCSS: string = $preview.css("background-image");
				if (previceBagroundCSS == null) {
					return;
				}
				var backgroundImageCssArray = previceBagroundCSS.split("/");
				var pathArray = backgroundImageCssArray[backgroundImageCssArray.length - 1].split('"');
				var path = pathArray[0];

				//なぜか、background-imageにfull-custom.htmlが紛れることがある。
				if (path != "null" && path != "full-custom.html" && path != "none") {
					$textFieldInPreview.css("visibility", "hidden");
				} else {//画像が存在しないとき、テキストEdit機能を表示する。
					this._updatePreviewInDetailArea("none", $preview);
					$textFieldInPreview.css("visibility", "visible");
					
				}
			}

			/**
			 * 現在ターゲットとなっているボタンの state を取得する
			 * 
			 * @param stateId {number} 現在ターゲットとなっているボタンから取得する state の ID
			 * @return {IStateDetail} 取得した state の情報。存在しない場合は undefined
			 */
			private _getCurrentTargetState(stateId: number): IStateDetail {
				if (!this.currentTargetButtonStates_) {
					return undefined;
				}
				var targetStates = this.currentTargetButtonStates_.filter((state) => {
					return state.id === stateId;
				});
				if (!targetStates || !targetStates.length) {
					return undefined;
				}

				return targetStates[0];
			}

			/**
			 * 現在ターゲットとなっているアイテムを削除する
			 */
			private _deleteCurrentTargetItem() {
				if (!this.$currentTarget_) {
					console.error(TAG + "[FullCutsom._deleteCurrentTargetItem] target item is not found.");
					return;
				}

				var model: ItemModel = null;
				//var moduleId = this._getCurrentCanvasPageModuleId();
				switch (this.currentTargetModel_.type) {
					case "button":
						if (this.currentTargetModel_.button) {
							model = this.currentTargetModel_.button;
						}
						break;
					case "label":
						if (this.currentTargetModel_.label) {
							model = this.currentTargetModel_.label;
						}
						break;
					case "image":
						if (this.currentTargetModel_.image) {
							model = this.currentTargetModel_.image;
						}
						break;
					default:
						console.error(TAG + "[FullCutsom._deleteCurrentTargetItem] unknown model type.");
						return;
				}

				if (model == null) {
					console.error(TAG + "[FullCutsom._deleteCurrentTargetItem] mode is null.");
					return;
				}

				// model 状態を無効にする
				var memento: IMemento = {
					target: model,
					previousData: {
						enabled: true
					},
					nextData: {
						enabled: false
					}
				};
				var mementoCommand = new MementoCommand(memento);
				this.commandManager_.invoke(mementoCommand);

				this._updateItemElementOnCanvas(model);
				var $detail = $("#face-item-detail");
				$detail.children().remove();
				// DOM の削除
				//this.$currentTarget_.remove();

				//// model の削除
				//var moduleId = this._getCurrentCanvasPageModuleId();
				//switch (this.currentTargetModel_.type) {
				//	case "button":
				//		this.faceRenderer_canvas_.deleteButton(this.currentTargetModel_.button, moduleId);
				//		break;
				//	case "label":
				//		this.faceRenderer_canvas_.deleteLabel(this.currentTargetModel_.label, moduleId);
				//		break;
				//	case "image":
				//		this.faceRenderer_canvas_.deleteImage(this.currentTargetModel_.image, moduleId);
				//		break;
				//	default:
				//		console.error(TAG + "[FullCutsom._deleteCurrentTargetItem] unknown model type.");
				//}
			}

			/**
			 * 選択中のボタンのアクション設定を行う。
			 * onItemPropertySelectChanged() から呼び出されることが前提。
			 * 
			 * @param $select {JQuery} onItemPropertySelectChanged の発火元となった select 要素の jQuery オブジェクト
			 */
			private _setButtonStateActionsBySelect($select: JQuery) {
				if (!this.currentTargetButtonStates_) {
					return;
				}

				let stateId = parseInt(JQUtils.data($select, "stateId"), 10); //$target.data("state-id");
				if (_.isUndefined(stateId)) {
					return;
				}
				let type: string = JQUtils.data($select, "type"); //$target.data("type");
				if (_.isUndefined(type)) {
					return;
				}
				let value: string = $select.val();

				let stateDetail: IStateDetail = this.currentTargetButtonStates_[stateId];
				if (_.isUndefined(stateDetail)) {
					return;
				}
				let actionList = stateDetail.actionList;
				if (_.isUndefined(actionList)) {
					return;
				}

				switch (type) {
					case "state-input":
						{
							let actionName = actionList[value];
							if (!_.isUndefined(actionName)) {
								$("#select-state-action-function-" + stateId).val(actionName).selectmenu('refresh');
							}
						}
						break;

					case "state-action":
						{
							let inputName = $("#select-state-action-input-" + stateId).val();
							if (!_.isUndefined(inputName)) {
								actionList[inputName] = value;
								this.currentTargetButtonStatesUpdated_ = true;
								this._updateCurrentModelButtonStatesData();
							}
						}
						break;
				}
			}

			/**
			 * 画像の resizeMode を設定する。
			 * 
			 * @param $select {JQuery} 
			 */
			private _setImageResizeModeBySelect($select: JQuery) {
				let resizeMode: string = $select.val();
				if ($select.hasClass("button-state-property")) {
					let stateId = parseInt(JQUtils.data($select, "stateId"), 10);
					this._updateCurrentModelStateData(stateId, "resizeMode", resizeMode);
				} else {
					this._updateCurrentModelData("resizeMode", resizeMode);
				}
			}

			/**
			 * ページを削除する。
			 * 
			 * @param $pageModule {JQuery} 削除するページ
			 */
			private _deletePage($pageModule: JQuery) {
				
				let response = electronDialog.showMessageBox({
					type: "warning",
					message: $.i18n.t("dialog.message.STR_DAIALOG_ALERT_DELTE_PAGE"),
					buttons: [$.i18n.t("dialog.button.STR_DIALOG_BUTTON_DELETE"), $.i18n.t("dialog.button.STR_DIALOG_BUTTON_CANCEL")],
					title: PRODUCT_NAME,
					cancelId: 1,
				});
				if (response == 0) {//
					//let moduleId: string = $pageModule.data("cid");
					let pageIndex = parseInt(JQUtils.data($pageModule, "modulePageIndex"), 10); // $pageModule.data("module-page-index");
					//this.faceRenderer_canvas_.deletePage(moduleId);
					this.faceRenderer_canvas_.deletePage(pageIndex);
					let $pageContainer = $pageModule.parent();
					$pageContainer.remove();
					return;
				} else {
					return;
				}

				
			}

			/**
			 * 指定した area を検証し、妥当な area の値を返す。
			 * チェック項目は、画面範囲外チェックと重なっていないかどうかのチェック (ボタンのみ)
			 * 
			 * @param area {IArea} 現在の target となるアイテムの新しい area。ただし、すべてのプロパティが揃わなくてもよい。
			 * @return {IArea} 妥当性が確認された area 
			 */
			private _validateArea(area: { x?: number, y?: number, w?: number, h?: number }): IArea {
				if (!this.currentTargetModel_) {
					console.warn(TAG + "_validateArea() target model not found.");
					return null;
				}
				var model = null;
				switch (this.currentTargetModel_.type) {
					case "button":
						model = this.currentTargetModel_.button;
						break;

					case "label":
						model = this.currentTargetModel_.label;
						break;

					case "image":
						model = this.currentTargetModel_.image;
						break;

					default:
						console.error(TAG + "_validateArea() Unknown model type");
				}

				if (!model) {
					console.warn(TAG + "_validateArea() target model not found");
					return null;
				}

				var complementedArea: IArea = $.extend(true, {}, model.area, area);

				this._normalizeArea(complementedArea);

				if (this.currentTargetModel_.type === "button") {
					if (this._checkOverlapButton(complementedArea, model.cid)) {
						// 重なり合わせられた場合は、最初の area に戻す
						complementedArea = $.extend(true, {}, model.area);
					}
				}

				return complementedArea;
			}

			/**
			 * アイテムが HUIS の画面からはみ出さないように位置やサイズを正規化する。
			 * 
			 * @param area {IArea} [in,out] アイテムのエリア
			 */
			private _normalizeArea(area: IArea) {
				if (area.x < BIAS_X_DEFAULT_GRID_LEFT) {
					area.x = BIAS_X_DEFAULT_GRID_LEFT;
				}
				if (area.y < 0) {
					area.y = 0;
				}
				if (area.w <= 0) {
					area.w = this.gridSize_;
				}
				if (area.h <= 0) {
					area.h = this.gridSize_;
				}

				let maxX = GRID_AREA_WIDTH + BIAS_X_DEFAULT_GRID_LEFT;

				if (maxX < area.x + area.w) {
					if (GRID_AREA_WIDTH < area.w) {
						area.w = GRID_AREA_WIDTH;
						area.x = BIAS_X_DEFAULT_GRID_LEFT;
					} else {
						area.x = maxX - area.w;
					}
				}
				if (GRID_AREA_HEIGHT < area.y + area.h) {
					if (GRID_AREA_HEIGHT < area.h) {
						area.h = GRID_AREA_HEIGHT;
						area.y = 0;
					} else {
						area.y = GRID_AREA_HEIGHT - area.h;
					}
				}
			}

			/**
			 * 指定した area がいずかの button と衝突するかをチェックする。
			 * 
			 * @param area {IArea} チェックする area
			 * @param targetId {string} target となるボタンの cid。重なり判定時にボタン一覧から target となるボタンを除外するために使用する。
			 * @return {boolean} いずれかの button と衝突する場合はtrue。衝突しない場合は false
			 */
			private _checkOverlapButton(area: IArea, targetId?: string): boolean {
				if (!area) {
					console.error(TAG + "_checkOverlapButton()  area is undefined.");
					return false;
				}
				var moduleId = this._getCanvasPageModuleId();
				var buttons: Model.ButtonItem[] = this.faceRenderer_canvas_.getButtons(moduleId);
				if (!buttons) {
					return false;
				}

				for (let i = 0, l = buttons.length; i < l; i++) {
					let button = buttons[i];
					if (!button || !button.area) {
						continue;
					}
					if (button.cid === targetId) {
						continue;
					}
					if (!button.enabled) {
						continue;
					}
					let buttonArea = button.area;
					// 当たり判定
					if (area.x < buttonArea.x + buttonArea.w && buttonArea.x < area.x + area.w) {
						if (area.y < buttonArea.y + buttonArea.h && buttonArea.y < area.y + area.h) {
							return true;
						}
					}
				}

				return false;
			}

			/**
			 * キャンバス内に重なり合っているボタンがないかをチェックする。
			 * 
			 * @return {string} エラー文言。重なり合ったボタンがなかったら空文字が返る。
			 */
			private _overlapButtonsExist(): string {
				let result: string = "";
				let pageCount = this.faceRenderer_canvas_.getPageCount();
				for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
					// ページにある button を取得
					let pageModuleId = this._getCanvasPageModuleId(pageIndex);
					if (!pageModuleId) {
						continue;
					}
					let buttons = this.faceRenderer_canvas_.getButtons(pageModuleId);
					if (!buttons) {
						continue;
					}
					let buttonCount = buttons.length;
					if (buttonCount < 2) {
						continue;
					}

					// ページ内のボタンが重なり合わないかをチェック
					let overlapButtonCount = 0;
					for (let i = 0; i < buttonCount - 1; i++) {
						for (let j = i + 1; j < buttonCount; j++) {
							let button1Area = buttons[i].area,
								button2Area = buttons[j].area;
							// 両方のボタンが enabled 状態のときのみ判定
							if (buttons[i].enabled && buttons[j].enabled) {
								// 当たり判定
								if (button1Area.x < button2Area.x + button2Area.w && button2Area.x < button1Area.x + button1Area.w) {
									if (button1Area.y < button2Area.y + button2Area.h && button2Area.y < button1Area.y + button1Area.h) {
										console.warn(TAG + "_overlapButtonsExist()");
										console.warn("pageIndex: " + pageIndex + ", i: " + i + ", j: " + j);
										console.warn(button1Area);
										console.warn(button2Area);
										overlapButtonCount++;
									}
								}
							}
						}
					}
					if (0 < overlapButtonCount) {
						result += $.i18n.t("dialog.message.STR_DIALOG_WARN_OVERLAP_MESSAGE_DETAIL_INFO_1") + (pageIndex + 1) + $.i18n.t("dialog.message.STR_DIALOG_WARN_OVERLAP_MESSAGE_DETAIL_INFO_2") + overlapButtonCount + $.i18n.t("dialog.message.STR_DIALOG_WARN_OVERLAP_MESSAGE_DETAIL_INFO_3");
					}
				}
				return result;
			}

			/**
			 * 画面上の位置にあるアイテムを取得する。
			 * 
			 * @param position {IPosition} 位置
			 * @return {JQuery} 指定した位置にあるアイテムを返す。見つからない場合は null を返す。
			 */
			private _getTarget(position: IPosition): JQuery {				

				//label >> button >> images の優先順位
				//この順番は、_base.cssで定義されている z-indexの高い順  

				let $labels = $("#face-canvas .label-item");
				let $legelTarget = this._getTargetIn(position, $labels);
				if ($legelTarget != null) {
					return $legelTarget;
				}

				let $buttons = $("#face-canvas .button-item");
				let $buttonTarget = this._getTargetIn(position, $buttons);
				if ($buttonTarget != null) {
					return $buttonTarget;
				}

				let $images = $("#face-canvas .image-item");
				let $imageTarget = this._getTargetIn(position, $images);
				if ($imageTarget != null) {
					return $imageTarget;
				}
				
				return null;
			}


			/*
			* @param item :JQuery 位置
			* @param position {IPosition} 位置
			* @return {JQuery} 指定した位置にあるアイテムを返す。見つからない場合は null を返す。
			*/
			private _getTargetIn(position: IPosition, $items: JQuery): JQuery {
				let FUNCTION_NAME: string = TAG + " : _getTargetIn : ";
				if (position == undefined) {
					console.warn(FUNCTION_NAME + "position is undefined");
					return null;
				}

				if ($items == undefined) {
					console.warn(FUNCTION_NAME + "$item is undefined");
					return null;
				}

				var l = $items.length;
				for (let i = l - 1; 0 <= i; i--) {
					let $item = $items.eq(i);
					// 背景画像の場合は除外
					if ($item.hasClass("background")) {
						continue;
					}
					let itemX = $item.offset().left;
					let itemY = $item.offset().top;
					let itemW = $item.width() / 2;
					let itemH = $item.height() / 2;
					if (itemX <= position.x && position.x <= itemX + itemW) {
						if (itemY <= position.y && position.y <= itemY + itemH) {
							return $item;
						}
					}
				}

				return null;
			}

			/**
			 * 画面上の指定した位置にあるページを取得する。
			 */
			private _getTargetPageModule(position: IPosition): JQuery {
				var $modules = $("#face-canvas .module-container");

				for (let i = 0, l = $modules.length; i < l; i++) {
					let $module = $modules.eq(i);
					let moduleX = $module.offset().left;
					let moduleY = $module.offset().top;
					let moduleW = $module.width() / 2;
					let moduleH = $module.height() / 2;
					if (moduleX <= position.x && position.x <= moduleX + moduleW) {
						if (moduleY <= position.y && position.y <= moduleY + moduleH) {
							return $module;
						}
					}
				}

				return null;
			}

			/**
			 * pageModule の背景画像に相当する model を取得する。存在しない場合は作成する。
			 * 
			 * @param $pageModule {JQuery} pageModule の要素の jQuery オブジェクト
			 * @return {Model.ImageItem} pageModule の背景画像に相当する model 
			 */
			private _resolvePageBackgroundImageItem($pageModule: JQuery): Model.ImageItem {
				if (!$pageModule) {
					return null;
				}
				let moduleId: string = JQUtils.data($pageModule, "cid"); //$pageModule.data("cid");
				if (!moduleId) {
					console.warn(TAG + "_resolvePageBackgroundImageItem() moduleId is undefined.");
					return null;
				}
				let backgroundModel: Model.ImageItem = null;

				// page module 内の background を探す
				let $pageBackgound = $pageModule.find(".background");
				if (0 < $pageBackgound.length) {
					let itemId: string = JQUtils.data($pageBackgound, "cid"); //$pageBackgound.data("cid");
					if (itemId) {
						backgroundModel = this.faceRenderer_canvas_.getImage(moduleId, itemId);
					}
				}
				// 既存の backgroundModel が見つからない場合は作成する
				if (!backgroundModel) {
					backgroundModel = this.faceRenderer_canvas_.addImage("", moduleId);
					backgroundModel.enabled = false;
					this._updateItemElementOnCanvas(backgroundModel);
				}

				return backgroundModel;
			}

			/**
			 * 指定した位置に、現在のターゲットとなるアイテムがあるかどうかをチェックする。
			 * 
			 * @param position {IPosition} 位置
			 * @return {boolean} 指定した位置に現在のターゲットとなるアイテムがあったら true を返却。それ以外は false を返却。
			 */
			private _remainsTarget(position: IPosition): boolean {
				if (!this.$currentTarget_) {
					return false;
				}

				var targetX = this.$currentTarget_.offset().left;
				var targetY = this.$currentTarget_.offset().top;
				var targetW = this.$currentTarget_.width() / 2;
				var targetH = this.$currentTarget_.height() / 2;
				if (targetX <= position.x && position.x <= targetX + targetW) {
					if (targetY <= position.y && position.y <= targetY + targetH) {
						return true;
					}
				}

				return false;
			}

			/**
			 * 指定した位置に、詳細編集エリアがあるかどうかをチェックする。
			 * 
			 * @param position {IPosition} 位置
			 * @return {boolean} 指定した位置に詳細編集エリアがあれば true を返却。それ以外は false を返却。
			 */
			private _checkDetailItemAreaPosition(position: IPosition): boolean {
				var $detailArea = $("#face-item-detail-area");
				var detailX = $detailArea.offset().left;
				var detailY = $detailArea.offset().top;
				var detailW = $detailArea.width();
				var detailH = $detailArea.height();
				if (detailX <= position.x && position.x <= detailX + detailW) {
					if (detailY <= position.y && position.y <= detailY + detailH) {
						return true;
					}
				}

				return false;
			}

			/**
			 * 指定した座標上に、アイテムのリサイザーがあるかどうかをチェックする
			 */
			private _checkResizerSelected(position: IPosition): string {
				var result: string = null;

				var element = document.elementFromPoint(position.x, position.y);
				if (element) {
					let $element = $(element);
					if ($element.hasClass("item-resizer")) {
						if ($element.hasClass("left-top")) {
							result = "left-top";
						} else if ($element.hasClass("right-top")) {
							result = "right-top";
						} else if ($element.hasClass("right-bottom")) {
							result = "right-bottom";
						} else if ($element.hasClass("left-bottom")) {
							result = "left-bottom";
						}
					}
				}

				return result;
			}

			/**
			 * 指定したアイテムにリサイザーを追加する。
			 * 
			 * @param $item {JQuery} リサイザーを追加するアイテム
			 */
			private _setResizer($item: JQuery) {
				var $itemResizer = $item.find(".item-resizer");
				if ($itemResizer.length < 1) {
					$itemResizer = $(this.itemResizerTemplate_());
					$item.append($itemResizer);
				}
				// リサイザーの位置を設定
				const RESIZER_SIZE_HALF = 20 / 2;
				var itemWidth: number = $item.width();
                var itemHeight: number = $item.height();
                var itemThicknessHalf: number = ($item.outerWidth() - $item.innerWidth()) / 8;

				$item.find(".left-top").css({
                    left: "-" + (RESIZER_SIZE_HALF + itemThicknessHalf) + "px",
                    top: "-" + (RESIZER_SIZE_HALF + itemThicknessHalf) + "px"
				});
				$item.find(".right-top").css({
                    left: (itemWidth - RESIZER_SIZE_HALF + itemThicknessHalf) + "px",
                    top: "-" + (RESIZER_SIZE_HALF + itemThicknessHalf) + "px"
				});
				$item.find(".right-bottom").css({
                    left: (itemWidth - RESIZER_SIZE_HALF + itemThicknessHalf) + "px",
                    top: (itemHeight - RESIZER_SIZE_HALF + itemThicknessHalf) + "px"
				});
				$item.find(".left-bottom").css({
                    left: "-" + (RESIZER_SIZE_HALF + itemThicknessHalf) +"px",
                    top: (itemHeight - RESIZER_SIZE_HALF + itemThicknessHalf) + "px"
				});
			}

			/**
			 * ターゲットを外す
			 */
			private _loseTarget() {
				$("#face-canvas .item").removeClass("selected");
				$("#face-item-detail-area").removeClass("active");
				// リサイザーを削除
				$(".item-resizer").remove();

				//テキストエリアのフォーカスを外す
				$("input[type='text']").blur();

				// detail エリアの削除
				let $detail = $("#face-item-detail");
				$detail.children().remove();

				this.$currentTarget_ = null;
				this.currentTargetModel_ = null;
				this.currentTargetButtonStates_ = null;
				this.currentTargetButtonStatesUpdated_ = false;
			}

			/**
			 * グリッドを設定する
			 */
			private _setGridSize(gridSize: number) {
				var $facePages = $("#face-canvas").find(".face-page");
				switch (gridSize) {
					case 8:
						this.gridSize_ = 8;
						$facePages.css("background-image", "url(../res/icons/grid_08.png)");
						break;

					case 16:
						this.gridSize_ = 16;
						$facePages.css("background-image", "url(../res/icons/grid_16.png)");
                        break;

                    case DEFAULT_GRID:
                        this.gridSize_ = DEFAULT_GRID;
                        $facePages.css("background-image", "url(../res/images/img_huis_remote_area.png)");
                        break;

					case 32:
						this.gridSize_ = 32;
						$facePages.css("background-image", "url(../res/icons/grid_32.png)");
						break;

					case 64:
						this.gridSize_ = 64;
						$facePages.css("background-image", "url(../res/icons/grid_64.png)");
						break;

					default:
						this.gridSize_ = 2;
						$facePages.css("background-image", "url(../res/icons/nogrid.png)");
				}
			}

			/**
			 * 詳細編集エリアを表示する。
			 * 
			 * @param targetModel {TagetModel} 詳細編集エリアに表示するモデル
			 */
			private _showDetailItemArea(targetModel: TargetModel) {
				var $detail = $("#face-item-detail");
				$detail.children().remove();

				if (!targetModel) {
					return;
				}

				var templateArea = Tools.Template.getJST("#template-property-area", this.templateItemDetailFile_);

				switch (targetModel.type) {
					case "button":
						// ボタンアイテムの詳細エリアを表示
						this._renderButtonItemDetailArea(targetModel.button, $detail);
						//テキストをローカライズ
						$("#face-item-detail-title").find(".title-label").text($.i18n.t("edit.property.STR_EDIT_PROPERTY_TITLE_BUTTON"));
						$("#button-state-label-action").html($.i18n.t("edit.property.STR_EDIT_PROPERTY_LABEL_ACTION"));
						$("#text-title-edit-label").html($.i18n.t("edit.property.STR_EDIT_PROPERTY_LABEL_EDIT_TEXT_LABEL"));
						break;
					case "image":
						// 画像アイテムの詳細エリアを表示
						if (targetModel.image) {
							let templateImage = Tools.Template.getJST("#template-image-detail", this.templateItemDetailFile_);
							let $imageDetail = $(templateImage(targetModel.image));
							let $areaContainer = $imageDetail.nextAll("#area-container");
							$areaContainer.append($(templateArea(targetModel.image)));
							$detail.append($imageDetail);

							// リサイズモードの反映
							let resizeMode = targetModel.image.resizeMode;
							if (resizeMode) {
								$(".image-resize-mode").val(resizeMode);
							}
							this._updatePreviewInDetailArea(targetModel.image.resolvedPath, $("#property-image-preview"));
							//テキストをローカライズ
							$("#face-item-detail-title").html($.i18n.t("edit.property.STR_EDIT_PROPERTY_TITLE_IMAGE"));
						}
						break;
					case "label":
						// ラベルアイテムの詳細エリアを表示
						if (targetModel.label) {
							let templateLabel = Tools.Template.getJST("#template-label-detail", this.templateItemDetailFile_);
							let $labelDetail = $(templateLabel(targetModel.label));
							let $areaContainer = $labelDetail.nextAll("#area-container");
							$areaContainer.append($(templateArea(targetModel.label)));
							$detail.append($labelDetail);
							var $labelTextSize = $labelDetail.find(".property-text-size");
							$labelTextSize.val(targetModel.label.size.toString());

							//テキストをローカライズ
							$("#face-item-detail-title").html($.i18n.t("edit.property.STR_EDIT_PROPERTY_TITLE_LABEL"));
							$("#text-title-edit-label").html($.i18n.t("edit.property.STR_EDIT_PROPERTY_LABEL_EDIT_TEXT_LABEL"));
						}
						break;
					default:
						console.warn(TAG + "_showDetailItemArea() unknown type item");
                }

                //動的に追加されたcustom-selecctないのselectに対して、JQueryを適応する
                $('.custom-select').trigger('create');

				
			}

			/**
			 * ページの背景の詳細編集エリアの表示
			 */
			private _showDetailItemAreaOfPage($pageModule: JQuery) {
				let FUNCTION_NAME = TAG + " : _showDetailItemAreaOfPage : ";

				let $detail = $("#face-item-detail");
				$detail.children().remove();
				if (!$pageModule) {
					return;
				}

				let templatePageBackground = Tools.Template.getJST("#template-page-background-detail", this.templateItemDetailFile_);

				let backgroundModel: Model.ImageItem = null;

				// page module 内に background 
				let $pageBackground = $pageModule.find(".background");
				if (0 < $pageBackground.length) {
					let moduleId: string = JQUtils.data($pageModule, "cid");
					let itemId: string = JQUtils.data($pageBackground, "cid");
					if (moduleId && itemId) {
						backgroundModel = this.faceRenderer_canvas_.getImage(moduleId, itemId);
					}
				}
				if (backgroundModel && backgroundModel.enabled) {

					let $pageBackgroundDetail = $(templatePageBackground(backgroundModel));
					$detail.append($pageBackgroundDetail);
					let resizeMode = backgroundModel.resizeMode;
					if (resizeMode) {
						$(".image-resize-mode").val(resizeMode);
					}
					this._updatePreviewInDetailArea(backgroundModel.resolvedPath, $("#property-image-preview"), true);
				} else {
					let $pageBackgroundDetail = $(templatePageBackground({}));
					$detail.append($pageBackgroundDetail);
				}

				$("#face-item-detail-title").html($.i18n.t("edit.property.STR_EDIT_PROPERTY_TITLE_BACKGROUND"));
			}


			/*
			*  ボタンの中のコード(学習して登録した際の信号)をすべて返す
			*/
			private getCodesFrom(button: Model.ButtonItem): string[]{
				let FUNCTION_NAME: string = TAG + "getCodesFrom";

				if (button == undefined) {
					console.warn(FUNCTION_NAME + "button is undefined");
					return;
				}

				let result: string[] = [];

				for (let i = 0; i < button.state.length; i++) {
					for (let j = 0; j < button.state[i].action.length; j++) {
						if (button.state[i].action[j].code != undefined) {
							result.push(button.state[i].action[j].code);
						}
					}
				}

				if (result.length == 0) {
					return null;
				}

				return result;

			}

			/**
			 * ボタンアイテムの詳細情報エリアのレンダリング
			 */
			private _renderButtonItemDetailArea(button: Model.ButtonItem, $detail: JQuery) {
				if (!button || !$detail) {
					return;
				}

				// masterFunctions が未取得の場合は取得する
				let deviceInfo = button.deviceInfo;
				if (deviceInfo) {
					if (!deviceInfo.functions || deviceInfo.functions.length < 1) {
						let codeDb = deviceInfo.code_db;
						let codes: string[] = this.getCodesFrom(button);


						if (codeDb.brand != " " && codeDb.brand != undefined && 
							codeDb.device_type != " " && codeDb.device_type != undefined &&
							codeDb.model_number != " " && codeDb.device_type != undefined) {
							//codeDbの情報がそろっている場合、codeDbからfunctionsを代入
							deviceInfo.functions = huisFiles.getMasterFunctions(codeDb.brand, codeDb.device_type, codeDb.model_number);
						} else if(codes != null){
							//codeDbの情報がそろっていない、かつcode情報がある場合、codeからfunctionsを代入
							let remoteId = huisFiles.getRemoteIdByCode(codes[0]);
							if (remoteId != null) {
								deviceInfo.functions = huisFiles.getMasterFunctions(remoteId);
								deviceInfo.functionCodeHash= huisFiles.getMasterFunctionCodeMap(remoteId);
							}
						}


						button.deviceInfo = deviceInfo;
						
					}
				}

				

				// ボタン情報の外枠部分をレンダリング
				var templateButton = Tools.Template.getJST("#template-button-detail", this.templateItemDetailFile_);
				var $buttonDetail = $(templateButton(button));

				// ボタンのエリア情報を付加
				var templateArea = Tools.Template.getJST("#template-property-area", this.templateItemDetailFile_);
				var $areaContainer = $buttonDetail.nextAll("#area-container");
				$areaContainer.append($(templateArea(button)));


				// ボタンの state 情報を付加
				var $statesContainer = $buttonDetail.nextAll("#states-container");
				this.currentTargetButtonStates_ = button.state;
                if (this.currentTargetButtonStates_) {
                    let templateState: Tools.JST = null;
                    // エアコンのパーツはひとつのパーツに複数の要素(例えば温度には19℃～29℃、±0, 1, 2,...など)が登録されている。
                    if (button.deviceInfo && button.deviceInfo.code_db.device_type == "Air conditioner") { // エアコンのパーツはファイル名変更等の編集作業を受け付けない(位置変更のみ)
                        templateState = Tools.Template.getJST("#template-property-button-state-ac", this.templateItemDetailFile_);
                    } else {
                        templateState = Tools.Template.getJST("#template-property-button-state", this.templateItemDetailFile_);
                    }

                    // HUIS本体で「デフォルト指定が間違っていて要素のレンジ外を指している」ケースがあり得るのでその対策
                    // もしレンジ外を指している場合はレンジ内の最初に見つかった要素をdefaultとして一時的に設定し直す
                    // HUIS本体のデータ異常は解消されるわけではないので要注意

                    var checkedArray: IStateDetail[] = [];

                    if (button.deviceInfo) {
                        checkedArray = this.currentTargetButtonStates_.filter((state: IStateDetail, i: number, arr: IStateDetail[]) => {
                            return (
                                (button.default == state.id) &&
                                (((state.image != null) && (state.image[0] != null)) ||
                                 ((state.label != null) && (state.label[0] != null)) )
                                   );
                        });
                   
                        if (checkedArray.length === 0) { // レンジ内をdefaultが指していなかった(チェック用配列が空)
                            button.default = this.currentTargetButtonStates_[0].id; // 先頭のをdefault値として設定
                        }
                    }

                    this.currentTargetButtonStates_.forEach((state: IStateDetail) => {
                        let stateData: any = {};
                        stateData.id = state.id;
                        let resizeMode: string;
                        if (state.image) {
                            stateData.image = state.image[0];
                            let garageImageExtensions = state.image[0].garageExtensions;
                            if (garageImageExtensions) {
                                resizeMode = garageImageExtensions.resizeMode;
                            }
                        }
                        if (state.label) {
                            stateData.label = state.label[0];
                        }
                        if (button.deviceInfo && button.deviceInfo.functions) {
                            stateData.functions = button.deviceInfo.functions;
                        }

                        this._setActionListToState(state);

						if (button.deviceInfo && this.currentTargetButtonStates_.length > 1) { // Stateが２つ以上あるとき、default値に一致したパーツのみ表示する
                            if (state.id != button.default) return;
                        }

                        let $stateDetail = $(templateState(stateData));
                        $statesContainer.append($stateDetail);
                        // 文言あて・ローカライズ
                        $stateDetail.i18n();

                        if (resizeMode) {
                            $stateDetail.find(".state-image-resize-mode[data-state-id=\"" + stateData.id + "\"]").val(resizeMode);
                        }

                        let actionList = state.actionList;
                        let alreadyMenuSet = false;
                        if (actionList) {
                            // 「機能」が割り当てられている「入力」をメニューに表示されるようにする
                            for (let input in actionList) {
                                if (!alreadyMenuSet && actionList.hasOwnProperty(input) && actionList[input]) {
                                    var action = actionList[input];
                                    $stateDetail.find("#select-state-action-input-" + state.id).val(input);
                                    $stateDetail.find("#select-state-action-function-" + state.id).val(action);
                                    alreadyMenuSet = true;
                                }
                            }
                        }

						//テキストラベルの大きさの設定値を反映する。
						var $textSize = $stateDetail.find(".property-state-text-size[data-state-id=\"" + stateData.id + "\"]");
						if (!_.isUndefined(stateData.label)) {
							var textSizeString: string = stateData.label.size;
							$textSize.val(textSizeString);
						}

                    });
                    
				}

				
                $detail.append($buttonDetail);

				let $makerName = $(".button-info-brand-and-type").find(".brand_name");

				//ブランド名が空の場合,メーカー名情報がない旨に変換
				if ($makerName.text() == " ") {
					if (button.state[0].action[0].code != null) {
						$makerName.text($.i18n.t("edit.property.STR_EDIT_PROPERTY_TITLE_LEARNED"));
					} else {
						$makerName.text($.i18n.t("edit.property.STR_EDIT_PROPERTY_TITLE_NON_MAKER"));
					}
				}


                //x,y情報を別途　記入
                this.updateAreaInState(button.area.x, button.area.y, button.area.w, button.area.h);
                //previewの情報を別途更新。
                let $preview = $detail.find(".property-state-image-preview[data-state-id=\"" + button.default + "\"]");
                var resolvedPath = this._extractUrlFunction($preview.css("background-image"));
                this._updatePreviewInDetailArea(resolvedPath, $preview);
                //テキストボタン、あるいは画像のどちらかを表示する。
				this.toggleImagePreview(button.default);

                //this._updatePreviewInDetailArea($preview.attr("src"), $preview);
    

			}


            /*
            * url("***");から、***を抽出する
            */
            private _extractUrlFunction(urlFunctionString:string):string {
                if (urlFunctionString === undefined) {
                    console.log("FullCustom.ts:urlFunctionString urlFunctionString is undefined");
                    return;
                }
                var result:string =  urlFunctionString.substring(5, urlFunctionString.length - 2)//最初の5文字と　最後の２文字を取り除く。
                return result;

            }


			/**
			 * フルカスタムリモコン編集画面で扱いやすくするために、button.state 内の action と translate を
			 * input に対して1対1になるように格納する
			 */
			private _setActionListToState(state: IStateDetail) {
				var actionList: IActionList = {
					touch: "none",
					touch_top: "none",
					touch_bottom: "none",
					touch_right: "none",
					touch_left: "none",
					long_press: "none",
					swipe_up: "none",
					swipe_down: "none",
					swipe_right: "none",
					swipe_left: "none",
					ring_right: "none",
					ring_left: "none"
				};

				var actionListTranslate: IActionList = {
					touch: "none",
					touch_top: "none",
					touch_bottom: "none",
					touch_right: "none",
					touch_left: "none",
					long_press: "none",
					swipe_up: "none",
					swipe_down: "none",
					swipe_right: "none",
					swipe_left: "none",
					ring_right: "none",
					ring_left: "none"
				};

				var actions: IAction[] = state.action;
				if (actions) {
					actions.forEach((action) => {
						let codeDb = action.code_db;
						if (codeDb) {
							actionList[action.input] = codeDb.function;
						}
						//actionList[action.input] = action.code;
					});
				}

				
				var translates: IStateTranslate[] = state.translate;
				if (translates) {
					translates.forEach((translate) => {
						actionListTranslate[translate.input] = "translate-state-" + translate.next;
					});
				}

				state.actionList = actionList;
				state.actionListTranslate = actionListTranslate;
			}

            /**
            * 詳細編集エリアのステートのエリア情報をアップデート
            * @param inputX: numer　X座標
            * @param inputY: numer　Y座標
            * @param inputW: numer　W座標
            * @param inputH: numer　H座標
            **/
            private updateAreaInState(inputX: number, inputY: number, inputW: number, inputH: number) {

                if (inputX === undefined) {
                    console.log("updateAreaInState : inputX is undefined");
                    return;
                }

                if (inputY === undefined) {
                    console.log("updateAreaInState : inputY is undefined");
                    return;
                }

                if (inputW === undefined) {
                    console.log("updateAreaInState : inputW is undefined");
                    return;
                }

                if (inputH === undefined) {
                    console.log("updateAreaInState : inputH is undefined");
                    return;
                }

                let $paramXY = $("#state-button-x-y");
                var xStr: string = "X:";
                var yStr: string = "   Y:";
                var paramXYStr: string = xStr + inputX + yStr + inputY;
                $paramXY.html(paramXYStr);

                let $paramWH = $("#state-button-w-h");
                var wStr: string = "W:";
                var hStr: string = "   H:";
                var paramWHStr: string = wStr + inputW + hStr + inputH;
                $paramWH.html(paramWHStr);
            }

			/**
			 * 指定した要素にひも付けられている model を取得
			 * 
			 * @param $item {JQuery} 取得する model の要素
			 * @param $renderLocation {string} $item が canvas と pallet のどちらに存在するか
			 * 
			 * @return {TargetModel} 取得した model
			 */
			private _getItemModel($item: JQuery, rendererLocation?: string): TargetModel {
				// item の要素の data 属性から item の id を取得
				var itemId = JQUtils.data($item, "cid"); //$item.data("cid");
				// item の親要素の data 属性から item が所属する module の id を取得
				var moduleId = JQUtils.data($item.parent(), "cid"); // $item.parent().data("cid");

				// キャンバス用の face renderer かパレット用の face renderer か
				var renderer: FaceRenderer;
				if (rendererLocation === "pallet") {
					renderer = this.faceRenderer_pallet_;
				} else {
					renderer = this.faceRenderer_canvas_;
				}

				// item の種類に応じた model を取得
				if ($item.hasClass("button-item")) {
					return {
						type: "button",
						button: renderer.getButton(moduleId, itemId)
					};
				} else if ($item.hasClass("label-item")) {
					return {
						type: "label",
						label: renderer.getLabel(moduleId, itemId)
					};
				} else if ($item.hasClass("image-item")) {
					return {
						type: "image",
						image: renderer.getImage(moduleId, itemId)
					};
				} else {
					return null;
				}
			}

			/**
			 * 指定した model にひも付けられた canvas 上の要素を返す。
			 * 
			 * @param model {any} 
			 */
			private _getItemElementByModel(model): JQuery {
				if (!model || !model.cid) {
					return null;
				}

				var $element = $(".item[data-cid='" + model.cid + "']");

				return 0 < $element.length ? $element : null;
			}

			/**
			 * 指定したキャンバスページの module ID を取得する。
			 * pageIndex を指定しない場合は、現在のページの module ID を返す。
			 */
			private _getCanvasPageModuleId(pageIndex?: number): string {
				// 引数が未指定の場合は、現在のページindex を使用する
				if (_.isUndefined(pageIndex)) {
					pageIndex = this.currentTargetPageIndex_;
				}
				if (_.isUndefined(pageIndex) || pageIndex < 0) {
					return "";
				}
				var $targetPageOnCanvas = $("#face-canvas .face-page").eq(pageIndex);
				var $targetModuleOnCanvas = $targetPageOnCanvas.find(".module-container");
				var moduleId = JQUtils.data($targetModuleOnCanvas, "cid"); //$targetModuleOnCanvas.data("cid");
				if (!moduleId) {
					return "";
				}
				return moduleId;

            }

            private _syncPcToHuisAndBack(noWarn?: Boolean) {
                if (!noWarn) {
                    let response = electronDialog.showMessageBox({
                        type: "info",
                        message: "変更内容を HUIS に反映しますか？\n"
                        + "最初に接続した HUIS と異なる HUIS を接続している場合、\n"
                        + "HUIS 内のコンテンツが上書きされますので、ご注意ください。",
                        buttons: ["yes", "no"],
						title: PRODUCT_NAME,
						cancelId:1,
                    });
                    if (response !== 0) {
                        huisFiles.updateRemoteList(); // Remoteのリストを更新
                        Framework.Router.back(); // HUISにセーブしないままHOME画面に戻る
                        return;
                    }
                }

                huisFiles.updateRemoteList();
                if (HUIS_ROOT_PATH) {
                    let syncTask = new Util.HuisDev.FileSyncTask();
                    syncTask.exec(HUIS_FILES_ROOT, HUIS_ROOT_PATH, true, DIALOG_PROPS_DELTE_REMOTE, null, (err) => {
                        if (err) {
                            // [TODO] エラー値のハンドリング
                            electronDialog.showMessageBox({
                                type: "error",
                                message: "HUIS と同期できませんでした。\n"
                                + "HUIS が PC と接続されていない可能性があります。\n"
                                + "HUIS が PC に接続されていることを確認して、再度同期をお試しください。",
                                buttons: ["ok"],
								title: PRODUCT_NAME,
                            });
                        } else {
                            Framework.Router.back();
                        }
                    });
                }
            }


            /**
             * このリモコンを削除する
             */
            private _onCommandDeleteRemote() {
                var response = electronDialog.showMessageBox({
                    type: "warning",
                    message: $.i18n.t("dialog.message.STR_DIALOG_MESSAGE_ALERT_DELETE_REMOTE"),
                    buttons: [$.i18n.t("dialog.button.STR_DIALOG_BUTTON_DELETE"), $.i18n.t("dialog.button.STR_DIALOG_BUTTON_CANCEL")],
					title: PRODUCT_NAME,
					cancelId:1,
                }); 
                if (response === 0) {
                    huisFiles.removeFace(this._getUrlQueryParameter("remoteId"));
                    this._syncPcToHuisAndBack(true); // 警告なしに
                }
            }

            private _onTextBoxFocusIn() {
                this.isTextBoxFocused = true;
            }

            private _onTextBoxFocusOut() {
                this.isTextBoxFocused = false;
            }

            private _onKeyDown(event: JQueryEventObject) {
                //console.log("_onKeyDown : " + event.keyCode);
                //console.log("_onKeyDown : " + this.$currentTarget_);

                if (!this.isTextBoxFocused) {
                    switch (event.keyCode) {
                        case 8: // BS
                        case 46: // DEL
                            this._deleteCurrentTargetItem();
                            break;
                        case 90: // z Undo
                            if (event.ctrlKey) {
                                var targetModel = this.commandManager_.undo();
                                this._updateItemElementOnCanvas(targetModel);
                                // 現在のターゲットを外す
                                this._loseTarget();
								event.preventDefault();
                            }
                            break;
                        case 89: // y Redo
                            if (event.ctrlKey) {
                                var targetModel = this.commandManager_.redo();
                                this._updateItemElementOnCanvas(targetModel);
                                // 現在のターゲットを外す
                                this._loseTarget();
								event.preventDefault();
                            }
                        default:
                            break;
                    }
                }
            }

		}

		var View = new FullCustom();

	}
}