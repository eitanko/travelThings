/**
 * Expo config plugin: adds the iOS Share extension target (targets/share) to the generated Xcode project.
 * Survives `expo prebuild --clean` and EAS cloud builds because it runs every time the native project is generated.
 */
const fs = require('fs');
const path = require('path');
const { withXcodeProject, withEntitlementsPlist, withDangerousMod } = require('@expo/config-plugins');

const NAME = 'ShareExtension';
const SRC = 'targets/share';
const SWIFT = ['Classification.swift', 'Models.swift', 'Draft.swift', 'ShareModel.swift', 'ReviewView.swift', 'ShareViewController.swift'];
const FILES = [...SWIFT, 'Info.plist', 'share.entitlements'];

module.exports = function withShareExtension(config, { groupId, bundleSuffix = 'share' }) {
  const mainBundle = config.ios.bundleIdentifier;
  const extBundle = `${mainBundle}.${bundleSuffix}`;

  config = withEntitlementsPlist(config, (c) => {
    const groups = new Set(c.modResults['com.apple.security.application-groups'] ?? []);
    groups.add(groupId);
    c.modResults['com.apple.security.application-groups'] = [...groups];
    return c;
  });

  config = withDangerousMod(config, [
    'ios',
    (c) => {
      const dest = path.join(c.modRequest.platformProjectRoot, NAME);
      fs.mkdirSync(dest, { recursive: true });
      for (const f of FILES) fs.copyFileSync(path.join(c.modRequest.projectRoot, SRC, f), path.join(dest, f));
      return c;
    },
  ]);

  config = withXcodeProject(config, (c) => {
    const proj = c.modResults;
    if (proj.pbxTargetByName(NAME)) return c;
    const group = proj.addPbxGroup(FILES, NAME, NAME);
    const mainGroup = proj.getFirstProject().firstProject.mainGroup;
    proj.addToPbxGroup(group.uuid, mainGroup);

    const target = proj.addTarget(NAME, 'app_extension', NAME, extBundle);
    proj.addBuildPhase(SWIFT, 'PBXSourcesBuildPhase', 'Sources', target.uuid);
    proj.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid);
    proj.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid);

    const version = c.version ?? '1.0.0';
    const configs = proj.pbxXCBuildConfigurationSection();
    const listUuid = target.pbxNativeTarget.buildConfigurationList;
    const list = proj.pbxXCConfigurationList()[listUuid];
    for (const { value } of list.buildConfigurations) {
      const s = configs[value].buildSettings;
      Object.assign(s, {
        PRODUCT_BUNDLE_IDENTIFIER: extBundle,
        INFOPLIST_FILE: `${NAME}/Info.plist`,
        CODE_SIGN_ENTITLEMENTS: `${NAME}/share.entitlements`,
        SWIFT_VERSION: '5.0',
        IPHONEOS_DEPLOYMENT_TARGET: '16.0',
        TARGETED_DEVICE_FAMILY: '"1"',
        MARKETING_VERSION: version,
        CURRENT_PROJECT_VERSION: String(c.ios?.buildNumber ?? '1'),
        PRODUCT_NAME: '"$(TARGET_NAME)"',
        CODE_SIGN_STYLE: 'Automatic',
        SKIP_INSTALL: 'YES',
      });
    }
    return c;
  });

  // Lets `eas build` create credentials and provisioning profiles for the extension.
  config.extra = config.extra ?? {};
  config.extra.eas = config.extra.eas ?? {};
  const build = (config.extra.eas.build = config.extra.eas.build ?? {});
  const exp = (build.experimental = build.experimental ?? {});
  const ios = (exp.ios = exp.ios ?? {});
  ios.appExtensions = [
    ...(ios.appExtensions ?? []).filter((e) => e.targetName !== NAME),
    {
      targetName: NAME,
      bundleIdentifier: extBundle,
      entitlements: { 'com.apple.security.application-groups': [groupId] },
    },
  ];
  return config;
};
