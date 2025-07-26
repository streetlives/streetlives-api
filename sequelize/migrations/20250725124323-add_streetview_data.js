import models from '../../src/models';
import { updateInstance } from '../../src/services/data-changes';

const streetviews = [
  {
    slug: 'translatinx-network-chelsea',
    streetview_url: 'https://www.google.com/maps/place/The+Fit+Faction/@40.7453108,-73.9925804,3a,75y,14.82h,88.07t/data=!3m7!1e1!3m5!1smyCPoMyIAezPN3iaT7KA_w!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D1.932283034172798%26panoid%3DmyCPoMyIAezPN3iaT7KA_w%26yaw%3D14.81575811159139!7i16384!8i8192!4m6!3m5!1s0x89c2595dbc7f292b:0x3bea7ffd53532cee!8m2!3d40.7455052!4d-73.9925205!16s%2Fg%2F11k4m7bwgy?entry=ttu&g_ep=EgoyMDI1MDYwNC4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'safe-horizon-streetwork-project-harlem',
    streetview_url: 'https://www.google.com/maps/@40.8092232,-73.9489412,3a,75y,23h,90t/data=!3m7!1e1!3m5!1s1q_4cNgUdlutTKy1krIbMQ!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3D1q_4cNgUdlutTKy1krIbMQ%26yaw%3D23!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDcyMy4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'hebrew-immigrant-aid-society-hias-chelsea',
    streetview_url: 'https://www.google.com/maps/place/Center415/@40.750601,-73.9830265,3a,79.6y,109.85h,103.45t/data=!3m7!1e1!3m5!1sniD2sxEIobAwXtGenKBI8Q!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D-13.446727292498707%26panoid%3DniD2sxEIobAwXtGenKBI8Q%26yaw%3D109.84609260499681!7i16384!8i8192!4m16!1m9!3m8!1s0x89c25900ae653af7:0x61065519e9e1e7ef!2s415+5th+Ave,+New+York,+NY+10016!3b1!8m2!3d40.7504202!4d-73.9825587!10e5!16s%2Fg%2F11c5jv5ly4!3m5!1s0x89c25900a939feb5:0xf8c19f6115e30a04!8m2!3d40.7505525!4d-73.9827919!16s%2Fg%2F11g6n_ctyw?entry=ttu&g_ep=EgoyMDI1MDYwNC4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'onpoint-nyc-fka-new-york-harm-reduction-educators-nyhre-washington-heights',
    streetview_url: 'https://www.google.com/maps/@40.8475305,-73.9316424,3a,75y,193.67h,94.71t/data=!3m7!1e1!3m5!1sSc7wIw9f34bIM6ANZe8gzw!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D-4.707379507199775%26panoid%3DSc7wIw9f34bIM6ANZe8gzw%26yaw%3D193.6658934924013!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDYwNC4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'exponents-financial-district',
    streetview_url: 'https://www.google.com/maps/@40.7049852,-74.0159828,3a,90y,90t/data=!3m7!1e1!3m5!1svpvwchRJL6CFb6tllWqDig!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3DvpvwchRJL6CFb6tllWqDig%26yaw%3D0!7i13312!8i6656?entry=ttu&g_ep=EgoyMDI1MDcyMy4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'fifth-avenue-committee-fac-park-slope',
    streetview_url: 'https://www.google.com/maps/@40.6789674,-73.9828863,3a,90y,30.57h,87.5t/data=!3m7!1e1!3m5!1sPWsVpGm5mSVgWQbnqgP-Fw!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D2.5033189992303733%26panoid%3DPWsVpGm5mSVgWQbnqgP-Fw%26yaw%3D30.574941364142486!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDYwNC4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'project-renewal-greenwich-village',
    streetview_url: 'https://www.google.com/maps/@40.7283524,-74.0053417,3a,75y,102h,90t/data=!3m7!1e1!3m5!1sH4rloqwLRZyNdBpUC3geFw!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3DH4rloqwLRZyNdBpUC3geFw%26yaw%3D102!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDcyMy4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'nyc-communities-for-health-nycc4h-greenwich-village',
    streetview_url: 'https://www.google.com/maps/place/15+Washington+Pl,+New+York,+NY+10003/@40.7295855,-73.9948859,3a,75y,23.42h,96.1t/data=!3m7!1e1!3m5!1sOqHA_20tl_6ZIQVGn24pPg!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D-6.100846746471504%26panoid%3DOqHA_20tl_6ZIQVGn24pPg%26yaw%3D23.42072314900723!7i16384!8i8192!4m6!3m5!1s0x89c2599081d124e3:0xa130a0e7ded3a048!8m2!3d40.7297756!4d-73.9947772!16s%2Fg%2F11mcy85ln8?entry=ttu&g_ep=EgoyMDI1MDYwOC4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'mount-sinai-east-village',
    streetview_url: 'https://www.google.com/maps/@40.7231805,-73.9855959,3a,61.3y,91.55h,85.49t/data=!3m8!1e1!3m6!1s-sDyyeyQvtP1Ey44FKNiRw!2e0!5s20240901T000000!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D4.513965111928599%26panoid%3D-sDyyeyQvtP1Ey44FKNiRw%26yaw%3D91.55418132699242!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDYwOC4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'mount-sinai-west',
    streetview_url: 'https://www.google.com/maps/@40.7701948,-73.9870347,3a,75y,235.25h,93.81t/data=!3m7!1e1!3m5!1saiS2FFqRvSpIHHTpXgEBtA!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D-3.8100000000000023%26panoid%3DaiS2FFqRvSpIHHTpXgEBtA%26yaw%3D235.25!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDYwOC4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'safe-horizon-streetwork-project-lower-east-side',
    streetview_url: 'https://www.google.com/maps/@40.7160297,-73.9895394,3a,75y,284.23h,90t/data=!3m7!1e1!3m5!1sQwBCKUPnfMj2hT3DN4Lh4Q!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3DQwBCKUPnfMj2hT3DN4Lh4Q%26yaw%3D284.22873!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDYwOC4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'curtis-community-school-food-club-st-george',
    streetview_url: 'https://www.google.com/maps/@40.6447175,-74.0815887,3a,90y,329h,103.66t/data=!3m7!1e1!3m5!1sOc-oGyLhs6DOeGtWsn0N0g!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D-13.659999999999997%26panoid%3DOc-oGyLhs6DOeGtWsn0N0g%26yaw%3D329!7i13312!8i6656?entry=ttu&g_ep=EgoyMDI1MDYwOC4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'the-catholic-charities-community-services-of-the-archdiocese-of-new-york-cccs-yonkers',
    streetview_url: 'https://www.google.com/maps/@40.9333832,-73.8730035,3a,90y,90t/data=!3m7!1e1!3m5!1sanjeNBWf_w2quEetPbVtmQ!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3DanjeNBWf_w2quEetPbVtmQ%26yaw%3D0!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDcyMy4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'cardinal-mccloskey-community-services-co-op-city',
    streetview_url: 'https://www.google.com/maps/@40.8167321,-73.9200776,3a,40y,329h,90t/data=!3m7!1e1!3m5!1s4HncK6xCb-1kyBqZLdWnaQ!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3D4HncK6xCb-1kyBqZLdWnaQ%26yaw%3D329!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDcyMy4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'rising-ground-fka-sheltering-arms-episcopal-social-services-queens-village',
    streetview_url: 'https://www.google.com/maps/@40.7056394,-73.7944034,3a,30y,342h,90t/data=!3m7!1e1!3m5!1sAr7qhA89ib3i7ABV01w7uA!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3DAr7qhA89ib3i7ABV01w7uA%26yaw%3D342!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDcyMy4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'ali-forney-center-afc-harlem',
    streetview_url: 'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=40.8107313,-73.952378&fov=50&heading=66&pano=lBxUK6Ri31nB8eQxEVtx-g',
  },
  {
    slug: 'nyc-health-hospitalsgotham-health-stapleton',
    streetview_url: 'https://www.google.com/maps/place/NYC+Health+%2B+Hospitals%2FGotham+Health,+Vanderbilt/@40.6202243,-74.0768381,3a,75y,329.14h,93.42t/data=!3m7!1e1!3m5!1sVh5z7x4cVdkjygZzBWo7ng!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D-3.4218627463378084%26panoid%3DVh5z7x4cVdkjygZzBWo7ng%26yaw%3D329.1387231895224!7i16384!8i8192!4m15!1m8!3m7!1s0x89c24fb2acecca79:0xc3cd04cb62bef972!2s165+Vanderbilt+Ave,+Staten+Island,+NY+10304!3b1!8m2!3d40.6203745!4d-74.0768895!16s%2Fg%2F11gyrb2bm2!3m5!1s0x89c24f8155a77c69:0x3d209254b803a6e0!8m2!3d40.6203745!4d-74.0768895!16s%2Fg%2F11ghrd5prc?entry=ttu&g_ep=EgoyMDI1MDYwOC4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'xavier-mission-chelsea-46-w-16th-st-east-gate',
    streetview_url: 'https://www.google.com/maps/@40.7383908,-73.9951744,3a,75y,186.93h,82.49t/data=!3m8!1e1!3m6!1sU3TdxNku5UIEO3_CVhG8JQ!2e0!5s20240901T000000!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D7.512933721491379%26panoid%3DU3TdxNku5UIEO3_CVhG8JQ%26yaw%3D186.92980709090315!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDYwOS4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'betances-health-center-lower-east-side',
    streetview_url: 'https://www.google.com/maps/@40.7139389,-73.9837402,3a,75y,138h,90t/data=!3m7!1e1!3m5!1snP6qQJYbXzir75V2cRftbQ!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3DnP6qQJYbXzir75V2cRftbQ%26yaw%3D138!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDcyMy4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'the-door-hudson-square',
    streetview_url: 'https://www.google.com/maps/@40.7243048,-74.0048291,3a,90y,218h,90t/data=!3m7!1e1!3m5!1s5w2Hqh7SCfyzcSiqgxKfBw!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3D5w2Hqh7SCfyzcSiqgxKfBw%26yaw%3D218!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDcyMy4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'callen-lorde-morrisania',
    streetview_url: 'https://www.google.com/maps/place/Callen-Lorde+Bronx/@40.8221278,-73.9108044,3a,75y,114.4h,94.34t/data=!3m7!1e1!3m5!1sZwa4UshWAZMTnGDRjhYLYQ!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D-4.33884239504259%26panoid%3DZwa4UshWAZMTnGDRjhYLYQ%26yaw%3D114.40209547147144!7i16384!8i8192!4m6!3m5!1s0x89c2f5b5111341fd:0x916252bbbb6fc5da!8m2!3d40.8221251!4d-73.9105327!16s%2Fg%2F11b_3ft8cq?entry=ttu&g_ep=EgoyMDI1MDYwOC4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'utopia-resource-center-urc-greater-new-york-inc',
    streetview_url: 'https://www.google.com/maps/place/576+E+165th+St,+Bronx,+NY+10456/@40.8257204,-73.9066958,3a,75y,229.63h,90t/data=!3m7!1e1!3m5!1syqsEM7veXt7itVEjBeUyWQ!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3DyqsEM7veXt7itVEjBeUyWQ%26yaw%3D229.63277!7i16384!8i8192!4m15!1m8!3m7!1s0x89c2f44b79391a43:0xf40fc57d16bcdece!2s576+E+165th+St,+Bronx,+NY+10456!3b1!8m2!3d40.825512!4d-73.907017!16s%2Fg%2F11rg5yvlnw!3m5!1s0x89c2f44b79391a43:0xf40fc57d16bcdece!8m2!3d40.825512!4d-73.907017!16s%2Fg%2F11rg5yvlnw?entry=ttu&g_ep=EgoyMDI1MDYwOS4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'new-york-legal-assistance-group-nylag-financial-district',
    streetview_url: 'https://www.google.com/maps/place/100+Pearl+St,+New+York,+NY+10004/@40.7043846,-74.0097338,3a,75y,127.18h,101.74t/data=!3m7!1e1!3m5!1sduxjHzNXeBeiu3eWKc6wcA!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D-11.744214558576473%26panoid%3DduxjHzNXeBeiu3eWKc6wcA%26yaw%3D127.18131776351984!7i16384!8i8192!4m15!1m8!3m7!1s0x89c25a142b325ea9:0x1bd7d5a7cfa29fdd!2s100+Pearl+St,+New+York,+NY+10004!3b1!8m2!3d40.7042542!4d-74.0097092!16s%2Fg%2F11h5s42f_q!3m5!1s0x89c25a142b325ea9:0x1bd7d5a7cfa29fdd!8m2!3d40.7042542!4d-74.0097092!16s%2Fg%2F11h5s42f_q?entry=ttu&g_ep=EgoyMDI1MDYwOS4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'the-immigrant-defense-project-idp-midtown',
    streetview_url: 'https://www.google.com/maps/@40.7523923,-73.9841646,3a,34y,195h,90t/data=!3m7!1e1!3m5!1s2zib_spaRRMUC4nQuzBm9g!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3D2zib_spaRRMUC4nQuzBm9g%26yaw%3D195!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDcyMy4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'morris-heights-health-center-mhhc-fordham',
    streetview_url: 'https://www.google.com/maps/@40.8584916,-73.9030748,3a,75y,29h,90t/data=!3m7!1e1!3m5!1srAOe7_lu0dlZcZ_s7kqing!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3DrAOe7_lu0dlZcZ_s7kqing%26yaw%3D29!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDcyMy4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'community-counseling-and-mediation-ccm-clinton-hill',
    streetview_url: 'https://www.google.com/maps/@40.6825851,-73.9666964,3a,75y,76h,90t/data=!3m7!1e1!3m5!1sE4jCgeIuAf3gAkStQbyMAQ!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3DE4jCgeIuAf3gAkStQbyMAQ%26yaw%3D76!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDcyMy4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'xavier-mission-chelsea',
    streetview_url: 'https://www.google.com/maps/@40.7377601,-73.9956289,3a,75y,19h,90t/data=!3m7!1e1!3m5!1s9peOZ828n98ZNBNHIUUiAQ!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3D9peOZ828n98ZNBNHIUUiAQ%26yaw%3D19!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDcyMy4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'community-access-inc-harlem',
    streetview_url: 'https://www.google.com/maps/@40.8086526,-73.9486525,3a,75y,279h,90t/data=!3m8!1e1!3m6!1sKkFjlGLfEAcSGJoOy8vhoQ!2e0!5s20190501T000000!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3DKkFjlGLfEAcSGJoOy8vhoQ%26yaw%3D279!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDYwOS4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'the-door-mott-haven',
    streetview_url: 'https://www.google.com/maps/@40.8191151,-73.9138633,3a,75y,319h,90t/data=!3m7!1e1!3m5!1sBP0pIjRUbqLMLmpHE2jdRg!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3DBP0pIjRUbqLMLmpHE2jdRg%26yaw%3D319!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDcyMy4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'kings-county-family-court-downtown-brooklyn',
    streetview_url: 'https://www.google.com/maps/place/330+Jay+St,+Brooklyn,+NY+11201/@40.6948307,-73.9871933,3a,75y,255.48h,90t/data=!3m7!1e1!3m5!1sfje7_uZicWGq0Bry8DrdJQ!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3Dfje7_uZicWGq0Bry8DrdJQ%26yaw%3D255.47745!7i16384!8i8192!4m15!1m8!3m7!1s0x89c25a4a39fbce9d:0xdd363d2427515557!2s330+Jay+St,+Brooklyn,+NY+11201!3b1!8m2!3d40.6947503!4d-73.9876018!16s%2Fg%2F11bw3xvyny!3m5!1s0x89c25a4a39fbce9d:0xdd363d2427515557!8m2!3d40.6947503!4d-73.9876018!16s%2Fg%2F11bw3xvyny?entry=ttu&g_ep=EgoyMDI1MDYwOS4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'urban-justice-center-ujc-financial-district-40-rector-st-9th-fl',
    streetview_url: 'https://www.google.com/maps/@40.7084012,-74.0148796,3a,75y,17h,90t/data=!3m7!1e1!3m5!1s9MWNrKcXa9qCGDKfVmBeBA!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3D9MWNrKcXa9qCGDKfVmBeBA%26yaw%3D17!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDcyMy4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'osborne-association-brooklyn-heights',
    streetview_url: 'https://www.google.com/maps/@40.693314,-73.9916768,3a,37.6y,25h,90t/data=!3m7!1e1!3m5!1sz5BOLIiqkCg0tgO-i_ZugQ!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3Dz5BOLIiqkCg0tgO-i_ZugQ%26yaw%3D25!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDcyMy4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'st-johns-bread-and-life-bedford-stuyvesant',
    streetview_url: 'https://www.google.com/maps/@40.6901949,-73.9290192,3a,37.6y,352h,90t/data=!3m7!1e1!3m5!1sq51uqSJypWsjIP_zsBxVAA!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3Dq51uqSJypWsjIP_zsBxVAA%26yaw%3D352!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDcyMy4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'services-and-advocacy-for-lgbtqia2s-elders-sage-chelsea-305-7th-avenue-15th-floor',
    streetview_url: 'https://www.google.com/maps/@40.7468278,-73.9936864,3a,75y,112.1h,87.91t/data=!3m8!1e1!3m6!1sYzSrQ__f_XebrKdQePCXPQ!2e0!5s20220801T000000!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D2.087271795177969%26panoid%3DYzSrQ__f_XebrKdQePCXPQ%26yaw%3D112.09545652777835!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDYwOS4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'st-joes-soup-kitchen-greenwich-village',
    streetview_url: 'https://www.google.com/maps/place/12+W+12th+St,+New+York,+NY+10011/@40.734849,-73.9949824,3a,75y,233.5h,94.74t/data=!3m7!1e1!3m5!1sy3oqWe7yDtQ9g5umKNgKdg!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D-4.740562012225581%26panoid%3Dy3oqWe7yDtQ9g5umKNgKdg%26yaw%3D233.50057715410634!7i16384!8i8192!4m15!1m8!3m7!1s0x89c259977f5aa9b9:0x2dbc2cf479864ab!2s12+W+12th+St,+New+York,+NY+10011!3b1!8m2!3d40.7345397!4d-73.9950773!16s%2Fg%2F11rg65pjzc!3m5!1s0x89c259977f5aa9b9:0x2dbc2cf479864ab!8m2!3d40.7345397!4d-73.9950773!16s%2Fg%2F11rg65pjzc?entry=ttu&g_ep=EgoyMDI1MDYwOS4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'city-living-ny-hells-kitchen',
    streetview_url: 'https://www.google.com/maps/@40.7530782,-73.9930231,3a,41y,302h,90t/data=!3m7!1e1!3m5!1sjHiiBjpwgZK3mmHRDLK-OA!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3DjHiiBjpwgZK3mmHRDLK-OA%26yaw%3D302!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDcyMy4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'holy-apostles-soup-kitchen-chelsea',
    streetview_url: 'https://www.google.com/maps/@40.749453,-73.9992512,3a,75y,103h,90t/data=!3m7!1e1!3m5!1ssFzzJeWn6t0EmmTsuzzjKQ!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3DsFzzJeWn6t0EmmTsuzzjKQ%26yaw%3D103!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDcyMy4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'archdiocese-drug-abuse-prevention-program-adapp-throgs-neck',
    streetview_url: 'https://www.google.com/maps/place/Archdiocese+of+New+York+Drug+Abuse+Prevention+Program+(ADAPP)/@40.8142602,-73.8189071,3a,75y,344.97h,87.11t/data=!3m7!1e1!3m5!1st07i7_NTqEIqvenUuDSwqA!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D2.8935419534660554%26panoid%3Dt07i7_NTqEIqvenUuDSwqA%26yaw%3D344.97466235103!7i16384!8i8192!4m15!1m8!3m7!1s0x89c28b21e7ba554d:0x1deb155c9504b51b!2s2789+Schurz+Ave,+Bronx,+NY+10465!3b1!8m2!3d40.8144712!4d-73.8189892!16s%2Fg%2F11b8zq4rhb!3m5!1s0x89c24e72c0a79d3f:0xd02cad37dbe2aa41!8m2!3d40.8144519!4d-73.8189847!16s%2Fg%2F1tg_x_zb?entry=ttu&g_ep=EgoyMDI1MDYwOS4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'department-of-probation-concourse',
    streetview_url: 'https://www.google.com/maps/@40.8261779,-73.9207922,3a,75y,229.2h,92.55t/data=!3m7!1e1!3m5!1schKZ8hr3R6Oiyb1n4IjlvA!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D-2.549999999999997%26panoid%3DchKZ8hr3R6Oiyb1n4IjlvA%26yaw%3D229.2!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDYwOS4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'athena-psych-mott-haven',
    streetview_url: 'https://www.google.com/maps/@40.8156198,-73.9184046,3a,75y,325h,90t/data=!3m7!1e1!3m5!1s-NbAaR1IL_gMxoy7lrRb4g!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3D-NbAaR1IL_gMxoy7lrRb4g%26yaw%3D325!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDcyMy4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'lenox-hill-neighborhood-house-midtown-east',
    streetview_url: 'https://www.google.com/maps/place/619+Lexington+Ave,+New+York,+NY+10022/@40.7588476,-73.9706723,3a,75y,124.96h,102.47t/data=!3m7!1e1!3m5!1sLC3B6vba94AybWsZ0q4cYQ!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D-12.47299631341835%26panoid%3DLC3B6vba94AybWsZ0q4cYQ%26yaw%3D124.96418869019551!7i16384!8i8192!4m6!3m5!1s0x89c258e4a552b845:0xe5a2601bbb580be7!8m2!3d40.7585673!4d-73.9702457!16s%2Fg%2F11c250v7qt?entry=ttu&g_ep=EgoyMDI1MDYwOS4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'jewish-board-of-family-and-childrens-services-midtown',
    streetview_url: 'https://www.google.com/maps/@40.7518526,-73.9900366,3a,75y,109h,90t/data=!3m7!1e1!3m5!1sO1utlqwlPYtLW2qJdBycrA!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3DO1utlqwlPYtLW2qJdBycrA%26yaw%3D109!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDcyMy4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'association-of-community-employment-programs-for-the-homeless-ace-new-york-long-island-city',
    streetview_url: 'https://www.google.com/maps/@40.7514405,-73.9339829,3a,75y,127h,90t/data=!3m7!1e1!3m5!1sXPS86tf6UeSNw9YeCOuGIQ!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3DXPS86tf6UeSNw9YeCOuGIQ%26yaw%3D127!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDcyMy4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'project-hospitality-st-george',
    streetview_url: 'https://www.google.com/maps/@40.640079,-74.1317926,3a,90y,131.66h,107.08t/data=!3m7!1e1!3m5!1srsew1Hvs6fh4I085qBUUIg!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D-17.08%26panoid%3Drsew1Hvs6fh4I085qBUUIg%26yaw%3D131.66!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDYwOS4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'chelsea-community-fridge-chelsea',
    streetview_url: 'https://www.google.com/maps/@40.7377601,-73.9956289,3a,83y,29h,90t/data=!3m7!1e1!3m5!1s9peOZ828n98ZNBNHIUUiAQ!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3D9peOZ828n98ZNBNHIUUiAQ%26yaw%3D29!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDcyMy4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'the-door-hudson-square',
    streetview_url: 'https://www.google.com/maps/@40.7243048,-74.0048291,3a,83y,171h,90t/data=!3m7!1e1!3m5!1s5w2Hqh7SCfyzcSiqgxKfBw!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3D5w2Hqh7SCfyzcSiqgxKfBw%26yaw%3D171!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDcyMy4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'first-presbyterian-church-of-brooklyn-downtown-brooklyn',
    streetview_url: 'https://www.google.com/maps/@40.6969392,-73.9932993,3a,75y,296h,90t/data=!3m7!1e1!3m5!1s8UZBYXH1WRhurI2Ym2g4Tw!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3D8UZBYXH1WRhurI2Ym2g4Tw%26yaw%3D296!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDcyMy4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'st-marys-clothing-drive-clinton-hill',
    streetview_url: 'https://www.google.com/maps/@40.6927914,-73.9608202,3a,75y,274h,90t/data=!3m7!1e1!3m5!1sJwRS7r53sxkcic0KWIMK9A!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3DJwRS7r53sxkcic0KWIMK9A%26yaw%3D274!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDcyMy4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'flatbush-friendly-fridge-prospect-lefferts-gardens',
    streetview_url: 'https://www.google.com/maps/@40.6599675,-73.9532543,3a,75y,2.15h,90t/data=!3m7!1e1!3m5!1svxe-4-pWmHyGkvVu-nfPlw!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3Dvxe-4-pWmHyGkvVu-nfPlw%26yaw%3D2.15!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDcyMy4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'newyork-presbyterian-nyp',
    streetview_url: 'https://www.google.com/maps/@40.7584837,-73.9731509,3a,75y,47.07h,90t/data=!3m7!1e1!3m5!1sEHPd7AAZx6vANuJ8bVUVQw!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3DEHPd7AAZx6vANuJ8bVUVQw%26yaw%3D47.07!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDcyMy4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'queens-affirming-youth-and-family-alliance-long-island-city',
    streetview_url: 'https://www.google.com/maps/@40.7498346,-73.9359302,3a,75y,126h,90t/data=!3m7!1e1!3m5!1s-K8T-yIFJ1jOVQBzfDyUaA!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3D-K8T-yIFJ1jOVQBzfDyUaA%26yaw%3D126!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDcyMy4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'cojo',
    streetview_url: 'https://www.google.com/maps/place/1523+Avenue+M,+Brooklyn,+NY+11230/@40.6180636,-73.9592444,3a,90y,333.48h,107.42t/data=!3m7!1e1!3m5!1sat7AanPHRR0_vJ3IQrWv_w!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D-17.417512690355323%26panoid%3Dat7AanPHRR0_vJ3IQrWv_w%26yaw%3D333.48379346002235!7i16384!8i8192!4m15!1m8!3m7!1s0x89c244b8a9a58ebf:0x5aebdf296d233b27!2s1523+Avenue+M,+Brooklyn,+NY+11230!3b1!8m2!3d40.6184452!4d-73.9593482!16s%2Fg%2F11bw3y7rd7!3m5!1s0x89c244b8a9a58ebf:0x5aebdf296d233b27!8m2!3d40.6184452!4d-73.9593482!16s%2Fg%2F11bw3y7rd7?entry=ttu&g_ep=EgoyMDI1MDYwOS4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'legal-aid-society-concourse-260-e-161-st',
    streetview_url: 'https://www.google.com/maps/@40.8256266,-73.9189653,3a,75y,197h,90t/data=!3m7!1e1!3m5!1sdXeaQ_Cm_OfpBLyi8VQGzw!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3DdXeaQ_Cm_OfpBLyi8VQGzw%26yaw%3D197!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDcyMy4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'bronx-counseling-center',
    streetview_url: 'https://www.google.com/maps/@40.8464862,-73.8937495,3a,75y,346h,90t/data=!3m7!1e1!3m5!1s9sBmYX1rcm-5ccGKMRnDeg!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3D9sBmYX1rcm-5ccGKMRnDeg%26yaw%3D346!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDcyMy4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'safe-horizon-fort-greene',
    streetview_url: 'https://www.google.com/maps/@40.6874678,-73.97978,3a,75y,52.13h,88.91t/data=!3m8!1e1!3m6!1saJSE8EPH9Kq0xXwSS-5TBg!2e0!5s20221101T000000!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D1.092820977291666%26panoid%3DaJSE8EPH9Kq0xXwSS-5TBg%26yaw%3D52.12912096109504!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDYwOS4wIKXMDSoASAFQAw%3D%3D',
  },
  {
    slug: 'morris-heights-health-center-mhhc-melrose',
    streetview_url: 'https://www.google.com/maps/@40.8221606,-73.9149594,3a,75y,296h,90t/data=!3m7!1e1!3m5!1sWgetCO3kV1aLU-WyhwOJAw!2e0!6shttps:%2F%2Fstreetviewpixels-pa.googleapis.com%2Fv1%2Fthumbnail%3Fcb_client%3Dmaps_sv.tactile%26w%3D900%26h%3D600%26pitch%3D0%26panoid%3DWgetCO3kV1aLU-WyhwOJAw%26yaw%3D296!7i16384!8i8192?entry=ttu&g_ep=EgoyMDI1MDcyMy4wIKXMDSoASAFQAw%3D%3D',
  },
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    for (const streetview of streetviews) {
      const location = await models.Location.findOne({
        where: {
          slug: streetview.slug,
        },
      });
      if (location) {
        await updateInstance('<System>', location, { streetview_url: streetview.streetview_url }, {
          metadata: {
            source: 'migration',
          },
        });
      }
    }
  },

  async down(queryInterface, Sequelize) {
    for (const streetview of streetviews) {
      const location = await models.Location.findOne({
        where: {
          slug: streetview.slug,
        },
      });
      if (location) {
        await updateInstance('<System>', location, { streetview_url: null }, {
          metadata: {
            source: 'migration',
          },
        });
      }
    }
  },
};
