/*M!999999\- enable the sandbox mode */
-- MariaDB dump 10.19  Distrib 10.11.17-MariaDB, for Linux (x86_64)
--
-- Host: localhost    Database: jackpotdb
-- ------------------------------------------------------
-- Server version	10.11.17-MariaDB-cll-lve

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `auth_group`
--

DROP TABLE IF EXISTS `auth_group`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `auth_group` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auth_group`
--

LOCK TABLES `auth_group` WRITE;
/*!40000 ALTER TABLE `auth_group` DISABLE KEYS */;
/*!40000 ALTER TABLE `auth_group` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `auth_group_permissions`
--

DROP TABLE IF EXISTS `auth_group_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `auth_group_permissions` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `group_id` int(11) NOT NULL,
  `permission_id` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `auth_group_permissions_group_id_permission_id_0cd325b0_uniq` (`group_id`,`permission_id`),
  KEY `auth_group_permissio_permission_id_84c5c92e_fk_auth_perm` (`permission_id`),
  CONSTRAINT `auth_group_permissio_permission_id_84c5c92e_fk_auth_perm` FOREIGN KEY (`permission_id`) REFERENCES `auth_permission` (`id`),
  CONSTRAINT `auth_group_permissions_group_id_b120cbf9_fk_auth_group_id` FOREIGN KEY (`group_id`) REFERENCES `auth_group` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auth_group_permissions`
--

LOCK TABLES `auth_group_permissions` WRITE;
/*!40000 ALTER TABLE `auth_group_permissions` DISABLE KEYS */;
/*!40000 ALTER TABLE `auth_group_permissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `auth_permission`
--

DROP TABLE IF EXISTS `auth_permission`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `auth_permission` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `content_type_id` int(11) NOT NULL,
  `codename` varchar(100) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `auth_permission_content_type_id_codename_01ab375a_uniq` (`content_type_id`,`codename`),
  CONSTRAINT `auth_permission_content_type_id_2f476e4b_fk_django_co` FOREIGN KEY (`content_type_id`) REFERENCES `django_content_type` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=245 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `auth_permission`
--

LOCK TABLES `auth_permission` WRITE;
/*!40000 ALTER TABLE `auth_permission` DISABLE KEYS */;
INSERT INTO `auth_permission` VALUES
(1,'Can add log entry',1,'add_logentry'),
(2,'Can change log entry',1,'change_logentry'),
(3,'Can delete log entry',1,'delete_logentry'),
(4,'Can view log entry',1,'view_logentry'),
(5,'Can add permission',2,'add_permission'),
(6,'Can change permission',2,'change_permission'),
(7,'Can delete permission',2,'delete_permission'),
(8,'Can view permission',2,'view_permission'),
(9,'Can add group',3,'add_group'),
(10,'Can change group',3,'change_group'),
(11,'Can delete group',3,'delete_group'),
(12,'Can view group',3,'view_group'),
(13,'Can add content type',4,'add_contenttype'),
(14,'Can change content type',4,'change_contenttype'),
(15,'Can delete content type',4,'delete_contenttype'),
(16,'Can view content type',4,'view_contenttype'),
(17,'Can add session',5,'add_session'),
(18,'Can change session',5,'change_session'),
(19,'Can delete session',5,'delete_session'),
(20,'Can view session',5,'view_session'),
(21,'Can add Blacklisted Token',6,'add_blacklistedtoken'),
(22,'Can change Blacklisted Token',6,'change_blacklistedtoken'),
(23,'Can delete Blacklisted Token',6,'delete_blacklistedtoken'),
(24,'Can view Blacklisted Token',6,'view_blacklistedtoken'),
(25,'Can add Outstanding Token',7,'add_outstandingtoken'),
(26,'Can change Outstanding Token',7,'change_outstandingtoken'),
(27,'Can delete Outstanding Token',7,'delete_outstandingtoken'),
(28,'Can view Outstanding Token',7,'view_outstandingtoken'),
(29,'Can add casino',8,'add_casino'),
(30,'Can change casino',8,'change_casino'),
(31,'Can delete casino',8,'delete_casino'),
(32,'Can view casino',8,'view_casino'),
(33,'Can add user',9,'add_user'),
(34,'Can change user',9,'change_user'),
(35,'Can delete user',9,'delete_user'),
(36,'Can view user',9,'view_user'),
(37,'Can add activity log',10,'add_activitylog'),
(38,'Can change activity log',10,'change_activitylog'),
(39,'Can delete activity log',10,'delete_activitylog'),
(40,'Can view activity log',10,'view_activitylog'),
(41,'Can add admin profile',11,'add_adminprofile'),
(42,'Can change admin profile',11,'change_adminprofile'),
(43,'Can delete admin profile',11,'delete_adminprofile'),
(44,'Can view admin profile',11,'view_adminprofile'),
(45,'Can add Admin Wallet',12,'add_adminwallet'),
(46,'Can change Admin Wallet',12,'change_adminwallet'),
(47,'Can delete Admin Wallet',12,'delete_adminwallet'),
(48,'Can view Admin Wallet',12,'view_adminwallet'),
(49,'Can add bonus config',13,'add_bonusconfig'),
(50,'Can change bonus config',13,'change_bonusconfig'),
(51,'Can delete bonus config',13,'delete_bonusconfig'),
(52,'Can view bonus config',13,'view_bonusconfig'),
(53,'Can add casino wallet account',14,'add_casinowalletaccount'),
(54,'Can change casino wallet account',14,'change_casinowalletaccount'),
(55,'Can delete casino wallet account',14,'delete_casinowalletaccount'),
(56,'Can view casino wallet account',14,'view_casinowalletaccount'),
(57,'Can add casino wallet transaction',15,'add_casinowallettransaction'),
(58,'Can change casino wallet transaction',15,'change_casinowallettransaction'),
(59,'Can delete casino wallet transaction',15,'delete_casinowallettransaction'),
(60,'Can view casino wallet transaction',15,'view_casinowallettransaction'),
(61,'Can add kyc submission',16,'add_kycsubmission'),
(62,'Can change kyc submission',16,'change_kycsubmission'),
(63,'Can delete kyc submission',16,'delete_kycsubmission'),
(64,'Can view kyc submission',16,'view_kycsubmission'),
(65,'Can add notification',17,'add_notification'),
(66,'Can change notification',17,'change_notification'),
(67,'Can delete notification',17,'delete_notification'),
(68,'Can view notification',17,'view_notification'),
(69,'Can add offline deposit log',18,'add_offlinedepositlog'),
(70,'Can change offline deposit log',18,'change_offlinedepositlog'),
(71,'Can delete offline deposit log',18,'delete_offlinedepositlog'),
(72,'Can view offline deposit log',18,'view_offlinedepositlog'),
(73,'Can add otp record',19,'add_otprecord'),
(74,'Can change otp record',19,'change_otprecord'),
(75,'Can delete otp record',19,'delete_otprecord'),
(76,'Can view otp record',19,'view_otprecord'),
(77,'Can add pending admin creation',20,'add_pendingadmincreation'),
(78,'Can change pending admin creation',20,'change_pendingadmincreation'),
(79,'Can delete pending admin creation',20,'delete_pendingadmincreation'),
(80,'Can view pending admin creation',20,'view_pendingadmincreation'),
(81,'Can add points log',21,'add_pointslog'),
(82,'Can change points log',21,'change_pointslog'),
(83,'Can delete points log',21,'delete_pointslog'),
(84,'Can view points log',21,'view_pointslog'),
(85,'Can add Registration',22,'add_registration'),
(86,'Can change Registration',22,'change_registration'),
(87,'Can delete Registration',22,'delete_registration'),
(88,'Can view Registration',22,'view_registration'),
(89,'Can add reward',23,'add_reward'),
(90,'Can change reward',23,'change_reward'),
(91,'Can delete reward',23,'delete_reward'),
(92,'Can view reward',23,'view_reward'),
(93,'Can add super admin transaction',24,'add_superadmintransaction'),
(94,'Can change super admin transaction',24,'change_superadmintransaction'),
(95,'Can delete super admin transaction',24,'delete_superadmintransaction'),
(96,'Can view super admin transaction',24,'view_superadmintransaction'),
(97,'Can add user gift',25,'add_usergift'),
(98,'Can change user gift',25,'change_usergift'),
(99,'Can delete user gift',25,'delete_usergift'),
(100,'Can view user gift',25,'view_usergift'),
(101,'Can add user level',26,'add_userlevel'),
(102,'Can change user level',26,'change_userlevel'),
(103,'Can delete user level',26,'delete_userlevel'),
(104,'Can view user level',26,'view_userlevel'),
(105,'Can add wallet account',27,'add_walletaccount'),
(106,'Can change wallet account',27,'change_walletaccount'),
(107,'Can delete wallet account',27,'delete_walletaccount'),
(108,'Can view wallet account',27,'view_walletaccount'),
(109,'Can add wallet transaction',28,'add_wallettransaction'),
(110,'Can change wallet transaction',28,'change_wallettransaction'),
(111,'Can delete wallet transaction',28,'delete_wallettransaction'),
(112,'Can view wallet transaction',28,'view_wallettransaction'),
(113,'Can add wallet validation log',29,'add_walletvalidationlog'),
(114,'Can change wallet validation log',29,'change_walletvalidationlog'),
(115,'Can delete wallet validation log',29,'delete_walletvalidationlog'),
(116,'Can view wallet validation log',29,'view_walletvalidationlog'),
(117,'Can add casino event',30,'add_casinoevent'),
(118,'Can change casino event',30,'change_casinoevent'),
(119,'Can delete casino event',30,'delete_casinoevent'),
(120,'Can view casino event',30,'view_casinoevent'),
(121,'Can add event ticket request',31,'add_eventticketrequest'),
(122,'Can change event ticket request',31,'change_eventticketrequest'),
(123,'Can delete event ticket request',31,'delete_eventticketrequest'),
(124,'Can view event ticket request',31,'view_eventticketrequest'),
(125,'Can add poker tournament',32,'add_pokertournament'),
(126,'Can change poker tournament',32,'change_pokertournament'),
(127,'Can delete poker tournament',32,'delete_pokertournament'),
(128,'Can view poker tournament',32,'view_pokertournament'),
(129,'Can add poker registration',33,'add_pokerregistration'),
(130,'Can change poker registration',33,'change_pokerregistration'),
(131,'Can delete poker registration',33,'delete_pokerregistration'),
(132,'Can view poker registration',33,'view_pokerregistration'),
(133,'Can add promotion',34,'add_promotion'),
(134,'Can change promotion',34,'change_promotion'),
(135,'Can delete promotion',34,'delete_promotion'),
(136,'Can view promotion',34,'view_promotion'),
(137,'Can add affiliate profile',35,'add_affiliateprofile'),
(138,'Can change affiliate profile',35,'change_affiliateprofile'),
(139,'Can delete affiliate profile',35,'delete_affiliateprofile'),
(140,'Can view affiliate profile',35,'view_affiliateprofile'),
(141,'Can add referral commission',36,'add_referralcommission'),
(142,'Can change referral commission',36,'change_referralcommission'),
(143,'Can delete referral commission',36,'delete_referralcommission'),
(144,'Can view referral commission',36,'view_referralcommission'),
(145,'Can add responsible gambling settings',37,'add_responsiblegamblingsettings'),
(146,'Can change responsible gambling settings',37,'change_responsiblegamblingsettings'),
(147,'Can delete responsible gambling settings',37,'delete_responsiblegamblingsettings'),
(148,'Can view responsible gambling settings',37,'view_responsiblegamblingsettings'),
(149,'Can add support ticket',38,'add_supportticket'),
(150,'Can change support ticket',38,'change_supportticket'),
(151,'Can delete support ticket',38,'delete_supportticket'),
(152,'Can view support ticket',38,'view_supportticket'),
(153,'Can add spin config',39,'add_spinconfig'),
(154,'Can change spin config',39,'change_spinconfig'),
(155,'Can delete spin config',39,'delete_spinconfig'),
(156,'Can view spin config',39,'view_spinconfig'),
(157,'Can add spin global counter',40,'add_spinglobalcounter'),
(158,'Can change spin global counter',40,'change_spinglobalcounter'),
(159,'Can delete spin global counter',40,'delete_spinglobalcounter'),
(160,'Can view spin global counter',40,'view_spinglobalcounter'),
(161,'Can add spin history',41,'add_spinhistory'),
(162,'Can change spin history',41,'change_spinhistory'),
(163,'Can delete spin history',41,'delete_spinhistory'),
(164,'Can view spin history',41,'view_spinhistory'),
(165,'Can add affiliate login log',42,'add_affiliateloginlog'),
(166,'Can change affiliate login log',42,'change_affiliateloginlog'),
(167,'Can delete affiliate login log',42,'delete_affiliateloginlog'),
(168,'Can view affiliate login log',42,'view_affiliateloginlog'),
(169,'Can add affiliate click log',43,'add_affiliateclicklog'),
(170,'Can change affiliate click log',43,'change_affiliateclicklog'),
(171,'Can delete affiliate click log',43,'delete_affiliateclicklog'),
(172,'Can view affiliate click log',43,'view_affiliateclicklog'),
(173,'Can add spin settings',44,'add_spinsettings'),
(174,'Can change spin settings',44,'change_spinsettings'),
(175,'Can delete spin settings',44,'delete_spinsettings'),
(176,'Can view spin settings',44,'view_spinsettings'),
(177,'Can add supported location',45,'add_supportedlocation'),
(178,'Can change supported location',45,'change_supportedlocation'),
(179,'Can delete supported location',45,'delete_supportedlocation'),
(180,'Can view supported location',45,'view_supportedlocation'),
(181,'Can add promotion gallery image',46,'add_promotiongalleryimage'),
(182,'Can change promotion gallery image',46,'change_promotiongalleryimage'),
(183,'Can delete promotion gallery image',46,'delete_promotiongalleryimage'),
(184,'Can view promotion gallery image',46,'view_promotiongalleryimage'),
(185,'Can add destination',47,'add_destination'),
(186,'Can change destination',47,'change_destination'),
(187,'Can delete destination',47,'delete_destination'),
(188,'Can view destination',47,'view_destination'),
(189,'Can add gift item',48,'add_giftitem'),
(190,'Can change gift item',48,'change_giftitem'),
(191,'Can delete gift item',48,'delete_giftitem'),
(192,'Can view gift item',48,'view_giftitem'),
(193,'Can add gift step',49,'add_giftstep'),
(194,'Can change gift step',49,'change_giftstep'),
(195,'Can delete gift step',49,'delete_giftstep'),
(196,'Can view gift step',49,'view_giftstep'),
(197,'Can add hero stat',50,'add_herostat'),
(198,'Can change hero stat',50,'change_herostat'),
(199,'Can delete hero stat',50,'delete_herostat'),
(200,'Can view hero stat',50,'view_herostat'),
(201,'Can add landing settings',51,'add_landingsettings'),
(202,'Can change landing settings',51,'change_landingsettings'),
(203,'Can delete landing settings',51,'delete_landingsettings'),
(204,'Can view landing settings',51,'view_landingsettings'),
(205,'Can add testimonial',52,'add_testimonial'),
(206,'Can change testimonial',52,'change_testimonial'),
(207,'Can delete testimonial',52,'delete_testimonial'),
(208,'Can view testimonial',52,'view_testimonial'),
(209,'Can add tour package',53,'add_tourpackage'),
(210,'Can change tour package',53,'change_tourpackage'),
(211,'Can delete tour package',53,'delete_tourpackage'),
(212,'Can view tour package',53,'view_tourpackage'),
(213,'Can add trust badge',54,'add_trustbadge'),
(214,'Can change trust badge',54,'change_trustbadge'),
(215,'Can delete trust badge',54,'delete_trustbadge'),
(216,'Can view trust badge',54,'view_trustbadge'),
(217,'Can add vip service image',55,'add_vipserviceimage'),
(218,'Can change vip service image',55,'change_vipserviceimage'),
(219,'Can delete vip service image',55,'delete_vipserviceimage'),
(220,'Can view vip service image',55,'view_vipserviceimage'),
(221,'Can add vip tier',56,'add_viptier'),
(222,'Can change vip tier',56,'change_viptier'),
(223,'Can delete vip tier',56,'delete_viptier'),
(224,'Can view vip tier',56,'view_viptier'),
(225,'Can add why choose us feature',57,'add_whychooseusfeature'),
(226,'Can change why choose us feature',57,'change_whychooseusfeature'),
(227,'Can delete why choose us feature',57,'delete_whychooseusfeature'),
(228,'Can view why choose us feature',57,'view_whychooseusfeature'),
(229,'Can add destination media',58,'add_destinationmedia'),
(230,'Can change destination media',58,'change_destinationmedia'),
(231,'Can delete destination media',58,'delete_destinationmedia'),
(232,'Can view destination media',58,'view_destinationmedia'),
(233,'Can add vip tier benefit',59,'add_viptierbenefit'),
(234,'Can change vip tier benefit',59,'change_viptierbenefit'),
(235,'Can delete vip tier benefit',59,'delete_viptierbenefit'),
(236,'Can view vip tier benefit',59,'view_viptierbenefit'),
(237,'Can add two factor auth',60,'add_twofactorauth'),
(238,'Can change two factor auth',60,'change_twofactorauth'),
(239,'Can delete two factor auth',60,'delete_twofactorauth'),
(240,'Can view two factor auth',60,'view_twofactorauth'),
(241,'Can add two factor backup code',61,'add_twofactorbackupcode'),
(242,'Can change two factor backup code',61,'change_twofactorbackupcode'),
(243,'Can delete two factor backup code',61,'delete_twofactorbackupcode'),
(244,'Can view two factor backup code',61,'view_twofactorbackupcode');
/*!40000 ALTER TABLE `auth_permission` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `authapp_activitylog`
--

DROP TABLE IF EXISTS `authapp_activitylog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_activitylog` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `action` varchar(50) NOT NULL,
  `description` longtext DEFAULT NULL,
  `amount` decimal(12,2) DEFAULT NULL,
  `cr_dr` varchar(2) DEFAULT NULL,
  `wallet_type` varchar(20) DEFAULT NULL,
  `before_balance` decimal(12,2) DEFAULT NULL,
  `after_balance` decimal(12,2) DEFAULT NULL,
  `casino_name` varchar(100) DEFAULT NULL,
  `reference_id` varchar(100) DEFAULT NULL,
  `meta` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`meta`)),
  `ip_address` char(39) DEFAULT NULL,
  `user_agent` longtext DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `actor_id` bigint(20) DEFAULT NULL,
  `target_user_id` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_activitylog_actor_id_134a8d27_fk_authapp_user_id` (`actor_id`),
  KEY `authapp_activitylog_target_user_id_1385cc96_fk_authapp_user_id` (`target_user_id`),
  CONSTRAINT `authapp_activitylog_actor_id_134a8d27_fk_authapp_user_id` FOREIGN KEY (`actor_id`) REFERENCES `authapp_user` (`id`),
  CONSTRAINT `authapp_activitylog_target_user_id_1385cc96_fk_authapp_user_id` FOREIGN KEY (`target_user_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `authapp_activitylog`
--

LOCK TABLES `authapp_activitylog` WRITE;
/*!40000 ALTER TABLE `authapp_activitylog` DISABLE KEYS */;
INSERT INTO `authapp_activitylog` VALUES
(1,'admin_login','Failed admin login attempt: harshavardhanvalikar@gmail.com',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{\"email\": \"harshavardhanvalikar@gmail.com\", \"success\": false}','106.222.231.123',NULL,'2026-07-13 06:44:05.007241',NULL,NULL),
(2,'admin_login','Failed admin login attempt: harshavardhanvalikar@gmail.com',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{\"email\": \"harshavardhanvalikar@gmail.com\", \"success\": false}','106.222.231.123',NULL,'2026-07-13 06:44:06.786374',NULL,NULL),
(3,'admin_login','Failed admin login attempt: admin@jackpotsworld.vip',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{\"email\": \"admin@jackpotsworld.vip\", \"success\": false}','106.222.231.123',NULL,'2026-07-13 06:46:11.910344',NULL,NULL),
(4,'admin_login','Failed admin login attempt: admin@jackpotsworld.vip',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{\"email\": \"admin@jackpotsworld.vip\", \"success\": false}','106.222.231.123',NULL,'2026-07-13 06:46:14.041188',NULL,NULL),
(5,'admin_login','Failed admin login attempt: admin@jackpotsworld.vip',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{\"email\": \"admin@jackpotsworld.vip\", \"success\": false}','106.222.231.123',NULL,'2026-07-13 06:46:15.388282',NULL,NULL),
(6,'admin_login','Failed admin login attempt: admin@jackpotsworld.vip',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{\"email\": \"admin@jackpotsworld.vip\", \"success\": false}','106.222.231.123',NULL,'2026-07-13 06:46:39.011094',NULL,NULL),
(7,'admin_login','Failed admin login attempt: admin@jackpotsworld.vip',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{\"email\": \"admin@jackpotsworld.vip\", \"success\": false}','106.222.231.123',NULL,'2026-07-13 06:46:43.505951',NULL,NULL),
(8,'admin_login','Failed super admin login attempt: superadmin@jackpotsworld.vip',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{\"email\": \"superadmin@jackpotsworld.vip\", \"success\": false, \"role\": \"superadmin\"}','106.222.231.123',NULL,'2026-07-13 07:05:01.581861',NULL,NULL),
(9,'admin_login','Failed super admin login attempt: superadmin@jackpotsworld.vip',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{\"email\": \"superadmin@jackpotsworld.vip\", \"success\": false, \"role\": \"superadmin\"}','106.222.231.123',NULL,'2026-07-13 07:09:09.014297',NULL,NULL),
(10,'admin_login','Failed super admin login attempt: superadmin@jackpotsworld.vip',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'{\"email\": \"superadmin@jackpotsworld.vip\", \"success\": false, \"role\": \"superadmin\"}','106.222.231.123',NULL,'2026-07-13 07:09:26.599780',NULL,NULL);
/*!40000 ALTER TABLE `authapp_activitylog` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `authapp_adminprofile`
--

DROP TABLE IF EXISTS `authapp_adminprofile`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_adminprofile` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `role` varchar(20) NOT NULL,
  `mobile` varchar(20) NOT NULL,
  `geo_location` varchar(120) NOT NULL,
  `department` varchar(60) NOT NULL,
  `notes` longtext NOT NULL,
  `last_login_ip` char(39) DEFAULT NULL,
  `last_login` datetime(6) DEFAULT NULL,
  `login_count` int(11) NOT NULL,
  `can_edit_users` tinyint(1) NOT NULL,
  `can_manage_finance` tinyint(1) NOT NULL,
  `can_approve_kyc` tinyint(1) NOT NULL,
  `can_send_notifs` tinyint(1) NOT NULL,
  `can_manage_vip` tinyint(1) NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `user_id` bigint(20) NOT NULL,
  `theme_preference` varchar(10) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`),
  KEY `authapp_adm_role_506ec0_idx` (`role`,`is_active`),
  CONSTRAINT `authapp_adminprofile_user_id_fc0c9324_fk_authapp_user_id` FOREIGN KEY (`user_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `authapp_adminprofile`
--

LOCK TABLES `authapp_adminprofile` WRITE;
/*!40000 ALTER TABLE `authapp_adminprofile` DISABLE KEYS */;
INSERT INTO `authapp_adminprofile` VALUES
(1,'superadmin','','','','',NULL,NULL,0,1,1,1,1,1,1,'2026-07-12 13:29:42.836222','2026-07-12 13:29:42.836237',1,'dark'),
(2,'admin','','','','',NULL,NULL,0,1,1,1,1,1,1,'2026-07-12 13:29:43.144243','2026-07-12 13:29:43.144257',2,'dark');
/*!40000 ALTER TABLE `authapp_adminprofile` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `authapp_adminwallet`
--

DROP TABLE IF EXISTS `authapp_adminwallet`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_adminwallet` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `cash_balance` decimal(18,2) NOT NULL,
  `non_cash_balance` decimal(18,2) NOT NULL,
  `otp_balance` decimal(18,2) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `updated_by_id` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_adminwallet_updated_by_id_b19322f7_fk_authapp_user_id` (`updated_by_id`),
  CONSTRAINT `authapp_adminwallet_updated_by_id_b19322f7_fk_authapp_user_id` FOREIGN KEY (`updated_by_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `authapp_adminwallet`
--

LOCK TABLES `authapp_adminwallet` WRITE;
/*!40000 ALTER TABLE `authapp_adminwallet` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_adminwallet` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `authapp_affiliateclicklog`
--

DROP TABLE IF EXISTS `authapp_affiliateclicklog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_affiliateclicklog` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `ip_address` char(39) DEFAULT NULL,
  `user_agent` varchar(255) NOT NULL,
  `landing_path` varchar(255) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `affiliate_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_aff_affilia_390314_idx` (`affiliate_id`,`created_at`),
  CONSTRAINT `authapp_affiliatecli_affiliate_id_345e9abc_fk_authapp_u` FOREIGN KEY (`affiliate_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `authapp_affiliateclicklog`
--

LOCK TABLES `authapp_affiliateclicklog` WRITE;
/*!40000 ALTER TABLE `authapp_affiliateclicklog` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_affiliateclicklog` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `authapp_affiliateloginlog`
--

DROP TABLE IF EXISTS `authapp_affiliateloginlog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_affiliateloginlog` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `ip_address` char(39) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `affiliate_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_affiliatelog_affiliate_id_3f3103a2_fk_authapp_u` (`affiliate_id`),
  CONSTRAINT `authapp_affiliatelog_affiliate_id_3f3103a2_fk_authapp_u` FOREIGN KEY (`affiliate_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `authapp_affiliateloginlog`
--

LOCK TABLES `authapp_affiliateloginlog` WRITE;
/*!40000 ALTER TABLE `authapp_affiliateloginlog` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_affiliateloginlog` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `authapp_affiliateprofile`
--

DROP TABLE IF EXISTS `authapp_affiliateprofile`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_affiliateprofile` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `commission_rate` decimal(5,2) NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `total_earned` decimal(14,2) NOT NULL,
  `total_paid` decimal(14,2) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `approved_by_id` bigint(20) DEFAULT NULL,
  `user_id` bigint(20) NOT NULL,
  `can_view_player_transactions` tinyint(1) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`),
  KEY `authapp_affiliatepro_approved_by_id_00406086_fk_authapp_u` (`approved_by_id`),
  CONSTRAINT `authapp_affiliatepro_approved_by_id_00406086_fk_authapp_u` FOREIGN KEY (`approved_by_id`) REFERENCES `authapp_user` (`id`),
  CONSTRAINT `authapp_affiliateprofile_user_id_7978cf69_fk_authapp_user_id` FOREIGN KEY (`user_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `authapp_affiliateprofile`
--

LOCK TABLES `authapp_affiliateprofile` WRITE;
/*!40000 ALTER TABLE `authapp_affiliateprofile` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_affiliateprofile` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `authapp_bonusconfig`
--

DROP TABLE IF EXISTS `authapp_bonusconfig`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_bonusconfig` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `vip_level` smallint(5) unsigned NOT NULL CHECK (`vip_level` >= 0),
  `bonus_type` varchar(10) NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `updated_by_id` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `authapp_bonusconfig_vip_level_bonus_type_fc121560_uniq` (`vip_level`,`bonus_type`),
  KEY `authapp_bonusconfig_updated_by_id_f97beede_fk_authapp_user_id` (`updated_by_id`),
  KEY `authapp_bonusconfig_vip_level_1dae2a02` (`vip_level`),
  KEY `authapp_bonusconfig_bonus_type_baaaa9c0` (`bonus_type`),
  CONSTRAINT `authapp_bonusconfig_updated_by_id_f97beede_fk_authapp_user_id` FOREIGN KEY (`updated_by_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `authapp_bonusconfig`
--

LOCK TABLES `authapp_bonusconfig` WRITE;
/*!40000 ALTER TABLE `authapp_bonusconfig` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_bonusconfig` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `authapp_casino`
--

DROP TABLE IF EXISTS `authapp_casino`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_casino` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `country` varchar(100) NOT NULL,
  `location` varchar(100) NOT NULL,
  `name` varchar(150) NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `authapp_casino_country_name_fae3dbc8_uniq` (`country`,`name`),
  KEY `authapp_casino_country_6a543eba` (`country`)
) ENGINE=InnoDB AUTO_INCREMENT=202 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `authapp_casino`
--

LOCK TABLES `authapp_casino` WRITE;
/*!40000 ALTER TABLE `authapp_casino` DISABLE KEYS */;
INSERT INTO `authapp_casino` VALUES
(166,'Sri Lanka','','Ballys Casino',1,'2026-07-12 13:28:01.567004'),
(167,'Sri Lanka','','Bellagio Casino',1,'2026-07-12 13:28:01.567042'),
(168,'Sri Lanka','','Casino Marina',1,'2026-07-12 13:28:01.567055'),
(169,'Sri Lanka','','Majestic Pride',1,'2026-07-12 13:28:01.567065'),
(170,'Sri Lanka','','City of Dreams',1,'2026-07-12 13:28:01.567076'),
(171,'India','','Deltin Royale',1,'2026-07-12 13:28:01.567087'),
(172,'India','','Deltin Jaqk',1,'2026-07-12 13:28:01.567097'),
(173,'India','','Big Daddy',1,'2026-07-12 13:28:01.567108'),
(174,'India','','Majestic Pride',1,'2026-07-12 13:28:01.567118'),
(175,'India','','Casino Pride',1,'2026-07-12 13:28:01.567129'),
(176,'India','','Kings Casino',1,'2026-07-12 13:28:01.567139'),
(177,'India','','Atlantiz',1,'2026-07-12 13:28:01.567168'),
(178,'India','','Ocean 7',1,'2026-07-12 13:28:01.567179'),
(179,'India','','Phoenix Casino',1,'2026-07-12 13:28:01.567189'),
(180,'India','','Majestic Neo',1,'2026-07-12 13:28:01.567200'),
(181,'India','','Gold Casino',1,'2026-07-12 13:28:01.567210'),
(182,'India','','Mahjong',1,'2026-07-12 13:28:01.567221'),
(183,'India','','Deltin Denzong',1,'2026-07-12 13:28:01.567232'),
(184,'Vietnam','','Casino Corona',1,'2026-07-12 13:28:01.567243'),
(185,'Vietnam','','Casino Grand',1,'2026-07-12 13:28:01.567254'),
(186,'Vietnam','','Casino Crown',1,'2026-07-12 13:28:01.567264'),
(187,'Macau','','Wynn Palace',1,'2026-07-12 13:28:01.567274'),
(188,'Macau','','City of Dreams',1,'2026-07-12 13:28:01.567284'),
(189,'Macau','','The Parisian',1,'2026-07-12 13:28:01.567294'),
(190,'Macau','','The Venetian',1,'2026-07-12 13:28:01.567304'),
(191,'Macau','','Galaxy',1,'2026-07-12 13:28:01.567315'),
(192,'Macau','','MGM',1,'2026-07-12 13:28:01.567324'),
(193,'Macau','','Sands Macao',1,'2026-07-12 13:28:01.567334'),
(194,'Macau','','Grand Lisboa',1,'2026-07-12 13:28:01.567344'),
(195,'Macau','','Wynn Macau',1,'2026-07-12 13:28:01.567354'),
(196,'Macau','','StarWorld',1,'2026-07-12 13:28:01.567364'),
(197,'Macau','','L\'Arc',1,'2026-07-12 13:28:01.567374'),
(198,'Philippines','','Okada Manila',1,'2026-07-12 13:28:01.567384'),
(199,'Philippines','','Solaire Resorts & Casino',1,'2026-07-12 13:28:01.567395'),
(200,'Philippines','','City of Dreams',1,'2026-07-12 13:28:01.567405'),
(201,'Philippines','','Resorts World',1,'2026-07-12 13:28:01.567415');
/*!40000 ALTER TABLE `authapp_casino` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `authapp_casinoevent`
--

DROP TABLE IF EXISTS `authapp_casinoevent`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_casinoevent` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `image` varchar(100) DEFAULT NULL,
  `name` varchar(200) NOT NULL,
  `country` varchar(100) NOT NULL,
  `city` varchar(100) NOT NULL,
  `venue` varchar(200) NOT NULL,
  `event_date` date NOT NULL,
  `event_time` time(6) DEFAULT NULL,
  `category` varchar(100) NOT NULL,
  `short_description` varchar(300) NOT NULL,
  `description` longtext NOT NULL,
  `ticket_note` varchar(300) NOT NULL,
  `status` varchar(20) NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `created_by_id` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_cas_is_acti_3fb5b3_idx` (`is_active`,`event_date`),
  KEY `authapp_casinoevent_created_by_id_a8afc8ad_fk_authapp_user_id` (`created_by_id`),
  KEY `authapp_casinoevent_country_ead38030` (`country`),
  KEY `authapp_casinoevent_event_date_7b06457b` (`event_date`),
  KEY `authapp_casinoevent_category_4f7a0f6e` (`category`),
  KEY `authapp_casinoevent_status_4d7dd149` (`status`),
  KEY `authapp_casinoevent_is_active_63e003b8` (`is_active`),
  CONSTRAINT `authapp_casinoevent_created_by_id_a8afc8ad_fk_authapp_user_id` FOREIGN KEY (`created_by_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `authapp_casinoevent`
--

LOCK TABLES `authapp_casinoevent` WRITE;
/*!40000 ALTER TABLE `authapp_casinoevent` DISABLE KEYS */;
INSERT INTO `authapp_casinoevent` VALUES
(1,'','WSOP Main Event 2026','United States','Las Vegas','Horseshoe & Paris Las Vegas','2026-07-02','11:00:00.000000','World Series of Poker','The world\'s biggest live poker tournament series returns to the Las Vegas Strip.','The World Series of Poker Main Event brings together thousands of players from over 100 countries to compete for a coveted WSOP bracelet and a multi-million dollar top prize across dozens of bracelet events.','Spectator passes and satellite qualifier packages available through Jackpots World.','live',1,'2026-07-12 13:28:01.280535','2026-07-12 13:28:01.280556',NULL),
(2,'','WSOP Europe — Rozvadov','Czech Republic','Rozvadov','King\'s Casino','2026-10-14','12:00:00.000000','World Series of Poker','WSOP\'s flagship European stop featuring bracelet events and the €10,000 Main Event.','King\'s Casino Rozvadov hosts the annual WSOP Europe festival, drawing the continent\'s top talent for three weeks of bracelet poker.','Group travel packages from India, Sri Lanka and the Philippines available.','upcoming',1,'2026-07-12 13:28:01.280591','2026-07-12 13:28:01.280598',NULL),
(3,'','World Poker Tour — WPT World Championship','United States','Las Vegas','Wynn Las Vegas','2026-12-03','10:00:00.000000','WPT','The WPT season finale crowns a new World Poker Tour Champion at Wynn Las Vegas.','A multi-day festival culminating in the $10,400 buy-in World Championship event, broadcast worldwide.','VIP hospitality packages include Wynn suite accommodation.','upcoming',1,'2026-07-12 13:28:01.280626','2026-07-12 13:28:01.280633',NULL),
(4,'','European Poker Tour — EPT Barcelona','Spain','Barcelona','Casino Barcelona','2026-08-19','12:00:00.000000','EPT','One of the EPT\'s most popular stops, combining beach, nightlife and high-stakes poker.','EPT Barcelona features the €5,300 Main Event alongside a packed schedule of side events for every bankroll.','Fly-in packages depart from Mumbai, Colombo, Manila and Ho Chi Minh City.','upcoming',1,'2026-07-12 13:28:01.280661','2026-07-12 13:28:01.280670',NULL),
(5,'','PokerStars Caribbean Adventure','Bahamas','Nassau','Atlantis Resort','2027-01-08','11:00:00.000000','PokerStars','PokerStars\' marquee winter festival on Paradise Island.','The PCA combines a $10,300 Main Event with a resort-wide festival atmosphere at the iconic Atlantis Resort.','Beachfront villa packages available for VIP guests.','upcoming',1,'2026-07-12 13:28:01.280697','2026-07-12 13:28:01.280704',NULL),
(6,'','Triton Poker Series — Jeju','South Korea','Jeju','Landing Casino','2026-09-09','13:00:00.000000','Triton','The high-roller Triton Series returns to Jeju with seven-figure prize pools.','Triton Poker\'s Jeju stop features buy-ins from HK$100,000 and attracts the world\'s top high-stakes professionals.','Invitation-only VIP viewing lounge access via Jackpots World.','upcoming',1,'2026-07-12 13:28:01.280732','2026-07-12 13:28:01.280739',NULL),
(7,'','Asian Poker Tour — APT Manila','Philippines','Manila','Okada Manila','2026-08-05','14:00:00.000000','APT','The APT\'s home leg returns to Okada Manila\'s dedicated poker room.','APT Manila showcases a two-week schedule anchored by the ?25,000,000 guaranteed Main Event.','Domestic packages available for Philippines-based players.','upcoming',1,'2026-07-12 13:28:01.280767','2026-07-12 13:28:01.280774',NULL),
(8,'','ICE — International Casino Exhibition','United Kingdom','London','ExCeL London','2027-02-03','09:00:00.000000','Gaming Expo','The gaming industry\'s largest B2B trade show, covering land-based and digital gaming.','ICE London brings together operators, suppliers and regulators from over 150 countries across four exhibition halls.','Trade passes only — hosted-buyer program available on request.','upcoming',1,'2026-07-12 13:28:01.280814','2026-07-12 13:28:01.280822',NULL),
(9,'','G2E — Global Gaming Expo','United States','Las Vegas','Venetian Expo','2026-10-06','09:00:00.000000','Gaming Expo','North America\'s leading gaming industry trade show and conference.','G2E showcases the latest in casino gaming technology, hospitality and regulatory trends alongside a packed conference agenda.','Trade passes only.','upcoming',1,'2026-07-12 13:28:01.280850','2026-07-12 13:28:01.280856',NULL),
(10,'','SiGMA Europe Summit','Malta','Valletta','MFCC Malta','2026-11-17','09:00:00.000000','Gaming Expo','SiGMA\'s flagship European summit for igaming and land-based gaming operators.','A multi-day summit covering igaming, land-based gaming, and emerging markets across Asia and the Balkans.','Trade passes only.','upcoming',1,'2026-07-12 13:28:01.280882','2026-07-12 13:28:01.280888',NULL),
(11,'','Deltin Poker Tournament — Goa Championship','India','Goa','Deltin Royale','2026-08-28','18:00:00.000000','Casino Conference','Jackpots World\'s flagship India casino weekend with live poker and gala dinner.','A curated weekend at Deltin Royale featuring a high-roller poker tournament, gala dinner and exclusive VIP floor access.','Includes 2-night stay and airport transfers for VIP guests.','upcoming',1,'2026-07-12 13:28:01.280913','2026-07-12 13:28:01.280920',NULL);
/*!40000 ALTER TABLE `authapp_casinoevent` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `authapp_casinowalletaccount`
--

DROP TABLE IF EXISTS `authapp_casinowalletaccount`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_casinowalletaccount` (
  `id` uuid NOT NULL,
  `user_uid` varchar(20) NOT NULL,
  `casino_name` varchar(120) NOT NULL,
  `wallet_type` varchar(3) NOT NULL,
  `balance` decimal(14,2) NOT NULL,
  `last_transaction_type` varchar(20) NOT NULL,
  `updated_by_email` varchar(254) DEFAULT NULL,
  `updated_at` datetime(6) NOT NULL,
  `user_id` bigint(20) NOT NULL,
  `country` varchar(100) NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `rolling_points` decimal(14,2) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `authapp_casinowalletacco_user_id_casino_name_wall_d5ad9d5b_uniq` (`user_id`,`casino_name`,`wallet_type`),
  KEY `authapp_cas_user_id_440557_idx` (`user_id`,`casino_name`),
  KEY `authapp_cas_user_ui_e20ad4_idx` (`user_uid`),
  KEY `authapp_casinowalletaccount_user_uid_f09beb49` (`user_uid`),
  KEY `authapp_casinowalletaccount_casino_name_d862a874` (`casino_name`),
  KEY `authapp_casinowalletaccount_wallet_type_da11c318` (`wallet_type`),
  KEY `authapp_casinowalletaccount_country_68f17a3c` (`country`),
  CONSTRAINT `authapp_casinowalletaccount_user_id_1f79e2fd_fk_authapp_user_id` FOREIGN KEY (`user_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_casinowalletaccount` WRITE;
/*!40000 ALTER TABLE `authapp_casinowalletaccount` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_casinowalletaccount` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_casinowallettransaction`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_casinowallettransaction` (
  `id` uuid NOT NULL,
  `unified_ref` varchar(100) NOT NULL,
  `user_uid` varchar(20) NOT NULL,
  `casino_name` varchar(120) NOT NULL,
  `wallet_type` varchar(3) NOT NULL,
  `transaction_type` varchar(10) NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `balance_before` decimal(14,2) NOT NULL,
  `balance_after` decimal(14,2) NOT NULL,
  `performed_by_email` varchar(254) DEFAULT NULL,
  `note` longtext NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `performed_by_id` bigint(20) DEFAULT NULL,
  `user_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_cas_user_ui_7aab59_idx` (`user_uid`,`casino_name`),
  KEY `authapp_cas_transac_cf52df_idx` (`transaction_type`),
  KEY `authapp_cas_created_71bfef_idx` (`created_at`),
  KEY `authapp_casinowallet_performed_by_id_889c4d94_fk_authapp_u` (`performed_by_id`),
  KEY `authapp_casinowallet_user_id_ac5aaa32_fk_authapp_u` (`user_id`),
  KEY `authapp_casinowallettransaction_unified_ref_7b91caa9` (`unified_ref`),
  KEY `authapp_casinowallettransaction_user_uid_cb068e8b` (`user_uid`),
  KEY `authapp_casinowallettransaction_casino_name_d367bbe3` (`casino_name`),
  KEY `authapp_casinowallettransaction_wallet_type_7e88bb83` (`wallet_type`),
  KEY `authapp_casinowallettransaction_transaction_type_d0ce6575` (`transaction_type`),
  KEY `authapp_casinowallettransaction_created_at_5b7b3bbc` (`created_at`),
  CONSTRAINT `authapp_casinowallet_performed_by_id_889c4d94_fk_authapp_u` FOREIGN KEY (`performed_by_id`) REFERENCES `authapp_user` (`id`),
  CONSTRAINT `authapp_casinowallet_user_id_ac5aaa32_fk_authapp_u` FOREIGN KEY (`user_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_casinowallettransaction` WRITE;
/*!40000 ALTER TABLE `authapp_casinowallettransaction` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_casinowallettransaction` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_destination`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_destination` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `flag_country_code` varchar(8) NOT NULL,
  `tagline` varchar(150) NOT NULL,
  `accent_color` varchar(20) NOT NULL,
  `casinos_text` varchar(300) NOT NULL,
  `best_for` varchar(150) NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `order` int(10) unsigned NOT NULL CHECK (`order` >= 0),
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_destination_is_active_e0706e8e` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_destination` WRITE;
/*!40000 ALTER TABLE `authapp_destination` DISABLE KEYS */;
INSERT INTO `authapp_destination` VALUES
(1,'Vietnam','VN','Paradise of the Orient','#D32F2F','Crown Casino - Danang, Casino Corona - Phu Quoc, Grand casino - Ho Tram','Slots, Baccarat, Hold\'em Poker',1,0,'2026-07-12 13:28:03.533410','2026-07-12 13:28:03.533423'),
(2,'Macau','MO','Vegas of the East','#1565C0','Venetian, Lisboa Grand, COD, Wynn','High Stakes Baccarat, VIP Rooms',1,1,'2026-07-12 13:28:03.535731','2026-07-12 13:28:03.535743'),
(3,'India','IN','Goa – Where Luck Meets Paradise','#FF6F00','Big Daddy Casino, Casino Pride, Deltin Jaqk, Deltin Royal, Majestic Pride','Poker, Roulette, Live Dealer Games',1,2,'2026-07-12 13:28:03.537443','2026-07-12 13:28:03.537455'),
(4,'Sri Lanka','LK','Jewel of the Indian Ocean','#7B1FA2','Bally\'s Colombo, Marina, Ballagio, Majestic Pride, City of Dreams','Blackjack, Slots, Live Poker',1,3,'2026-07-12 13:28:03.539503','2026-07-12 13:28:03.539515'),
(5,'Philippines','PH','Entertainment City Manila','#00838F','Solaire Resort Casino, City of Dreams - Manila','Baccarat, Roulette, Sports Betting',1,4,'2026-07-12 13:28:03.541539','2026-07-12 13:28:03.541551');
/*!40000 ALTER TABLE `authapp_destination` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_destinationmedia`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_destinationmedia` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `media` varchar(100) NOT NULL,
  `media_type` varchar(10) NOT NULL,
  `label` varchar(150) NOT NULL,
  `order` int(10) unsigned NOT NULL CHECK (`order` >= 0),
  `created_at` datetime(6) NOT NULL,
  `destination_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_destinationm_destination_id_2ec50265_fk_authapp_d` (`destination_id`),
  CONSTRAINT `authapp_destinationm_destination_id_2ec50265_fk_authapp_d` FOREIGN KEY (`destination_id`) REFERENCES `authapp_destination` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_destinationmedia` WRITE;
/*!40000 ALTER TABLE `authapp_destinationmedia` DISABLE KEYS */;
INSERT INTO `authapp_destinationmedia` VALUES
(1,'','image','Casino Corona, Phu Quoc',0,'2026-07-12 13:28:03.534067',1),
(2,'','image','Grand Casino, Ho Tram',1,'2026-07-12 13:28:03.534633',1),
(3,'','image','Crown Casino, Danang',2,'2026-07-12 13:28:03.535035',1),
(4,'','video','Vietnam Experience',3,'2026-07-12 13:28:03.535391',1),
(5,'','image','COD',0,'2026-07-12 13:28:03.536096',2),
(6,'','image','Wynn',1,'2026-07-12 13:28:03.536450',2),
(7,'','image','Venetian',2,'2026-07-12 13:28:03.536796',2),
(8,'','image','Lisboa Grand',3,'2026-07-12 13:28:03.537114',2),
(9,'','image','Big Daddy Casino',0,'2026-07-12 13:28:03.537825',3),
(10,'','image','Deltin Jaqk',1,'2026-07-12 13:28:03.538184',3),
(11,'','image','Deltin Royal',2,'2026-07-12 13:28:03.538520',3),
(12,'','image','Majestic Pride',3,'2026-07-12 13:28:03.538845',3),
(13,'','image','Casino Pride',4,'2026-07-12 13:28:03.539179',3),
(14,'','image','Majestic Pride',0,'2026-07-12 13:28:03.539854',4),
(15,'','image','Bally\'s',1,'2026-07-12 13:28:03.540181',4),
(16,'','image','Ballagio',2,'2026-07-12 13:28:03.540515',4),
(17,'','image','Marina',3,'2026-07-12 13:28:03.540845',4),
(18,'','image','City of Dreams',4,'2026-07-12 13:28:03.541214',4),
(19,'','image','Solaire Resort Casino',0,'2026-07-12 13:28:03.541892',5),
(20,'','image','City of Dreams Manila',1,'2026-07-12 13:28:03.542248',5);
/*!40000 ALTER TABLE `authapp_destinationmedia` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_eventticketrequest`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_eventticketrequest` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `event_id` bigint(20) NOT NULL,
  `user_id` bigint(20) NOT NULL,
  `admin_note` longtext NOT NULL,
  `status` varchar(12) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `authapp_eventticketrequest_event_id_user_id_09445c0c_uniq` (`event_id`,`user_id`),
  KEY `authapp_eventticketrequest_user_id_2b7c44fd_fk_authapp_user_id` (`user_id`),
  KEY `authapp_eventticketrequest_status_48f174ed` (`status`),
  CONSTRAINT `authapp_eventticketr_event_id_4fe5ec4e_fk_authapp_c` FOREIGN KEY (`event_id`) REFERENCES `authapp_casinoevent` (`id`),
  CONSTRAINT `authapp_eventticketrequest_user_id_2b7c44fd_fk_authapp_user_id` FOREIGN KEY (`user_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_eventticketrequest` WRITE;
/*!40000 ALTER TABLE `authapp_eventticketrequest` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_eventticketrequest` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_giftitem`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_giftitem` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `tier` varchar(30) NOT NULL,
  `tier_color` varchar(20) NOT NULL,
  `name` varchar(120) NOT NULL,
  `subtitle` varchar(200) NOT NULL,
  `logo` varchar(100) DEFAULT NULL,
  `value` varchar(30) NOT NULL,
  `description` longtext NOT NULL,
  `perks` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`perks`)),
  `accent_color` varchar(20) NOT NULL,
  `featured` tinyint(1) NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `order` int(10) unsigned NOT NULL CHECK (`order` >= 0),
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_giftitem_is_active_1dc6b78b` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_giftitem` WRITE;
/*!40000 ALTER TABLE `authapp_giftitem` DISABLE KEYS */;
INSERT INTO `authapp_giftitem` VALUES
(1,'LEGENDARY','#D4AF37','Rolex Submariner','Swiss Precision · Timeless Prestige','','$15K+','The icon of icons. A genuine Rolex Submariner — waterproof to 300m, Oystersteel bracelet, Cerachrom bezel. Worn by champions.','[\"Authenticated Certificate\", \"Luxury Gift Box\", \"Free Engraving\", \"Worldwide Delivery\"]','#D4AF37',1,1,0,'2026-07-12 13:28:03.513996','2026-07-12 13:28:03.514009'),
(2,'ULTRA','#4FC3F7','BMW M3 Competition','510 HP · Twin-Turbo · The Ultimate Machine','','$120K+','Pure M. The BMW M3 Competition — 510 horsepower, 0–100 in 3.9 seconds. Win it, drive it, live it.','[\"Full Registration\", \"Insurance 1st Year\", \"VIP Delivery Ceremony\", \"Track Day Experience\"]','#4FC3F7',0,1,1,'2026-07-12 13:28:03.514599','2026-07-12 13:28:03.514611'),
(3,'ULTRA','#C0C0C0','Mercedes-Benz GLE','AMG Line · 9G-Tronic · Pure Luxury','','$95K+','The three-pointed star. A Mercedes-Benz GLE AMG Line — commanding presence, whisper-quiet cabin, cutting-edge tech.','[\"Full Registration\", \"Insurance 1st Year\", \"Concierge Delivery\", \"AMG Accessories Pack\"]','#C8C8C8',0,1,2,'2026-07-12 13:28:03.515060','2026-07-12 13:28:03.515073'),
(4,'ELITE','#A8A8A8','Apple Ultra Bundle','iPhone 16 Pro Max · MacBook Pro · Vision Pro','','$6K+','The complete Apple ecosystem. iPhone 16 Pro Max, MacBook Pro M4, Apple Watch Ultra 2, and the future — Vision Pro.','[\"Apple Care+ 2 Years\", \"Setup & Delivery\", \"Engraving Option\", \"Accessories Kit\"]','#A8A8A8',0,1,3,'2026-07-12 13:28:03.515474','2026-07-12 13:28:03.515502');
/*!40000 ALTER TABLE `authapp_giftitem` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_giftstep`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_giftstep` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `icon` varchar(10) NOT NULL,
  `label` varchar(80) NOT NULL,
  `description` varchar(200) NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `order` int(10) unsigned NOT NULL CHECK (`order` >= 0),
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_giftstep_is_active_e268027f` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_giftstep` WRITE;
/*!40000 ALTER TABLE `authapp_giftstep` DISABLE KEYS */;
INSERT INTO `authapp_giftstep` VALUES
(1,'?','Play & Win','Earn with every game — Baccarat, Slots, Roulette & more',1,0,'2026-07-12 13:28:03.515923','2026-07-12 13:28:03.515936'),
(2,'?','Go Highroller','Qualify as a Highroller and unlock the exclusive prize vault',1,1,'2026-07-12 13:28:03.516417','2026-07-12 13:28:03.516429'),
(3,'?','Redeem Gifts','Choose your dream prize from our luxury gifts catalogue',1,2,'2026-07-12 13:28:03.516768','2026-07-12 13:28:03.516780'),
(4,'?','We Deliver','Verified, authenticated, delivered to your door worldwide',1,3,'2026-07-12 13:28:03.517091','2026-07-12 13:28:03.517103');
/*!40000 ALTER TABLE `authapp_giftstep` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_herostat`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_herostat` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `label` varchar(60) NOT NULL,
  `value` varchar(30) NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `order` int(10) unsigned NOT NULL CHECK (`order` >= 0),
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_herostat_is_active_336cc859` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_herostat` WRITE;
/*!40000 ALTER TABLE `authapp_herostat` DISABLE KEYS */;
INSERT INTO `authapp_herostat` VALUES
(1,'Players','20K+',1,0,'2026-07-12 13:28:03.505525','2026-07-12 13:28:03.505541'),
(2,'Won Today','$25 Mn+',1,1,'2026-07-12 13:28:03.506078','2026-07-12 13:28:03.506092'),
(3,'Countries','10+',1,2,'2026-07-12 13:28:03.506475','2026-07-12 13:28:03.506503'),
(4,'Support','24/7',1,3,'2026-07-12 13:28:03.508613','2026-07-12 13:28:03.508627');
/*!40000 ALTER TABLE `authapp_herostat` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_kycsubmission`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_kycsubmission` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `full_name` varchar(150) NOT NULL,
  `date_of_birth` date DEFAULT NULL,
  `document_type` varchar(50) NOT NULL,
  `document_number` varchar(100) NOT NULL,
  `doc_front` varchar(100) DEFAULT NULL,
  `doc_back` varchar(100) DEFAULT NULL,
  `selfie` varchar(100) DEFAULT NULL,
  `submitted_at` datetime(6) NOT NULL,
  `ip_address` char(39) DEFAULT NULL,
  `user_agent` longtext NOT NULL,
  `geo_country` varchar(100) NOT NULL,
  `geo_city` varchar(100) NOT NULL,
  `geo_region` varchar(100) NOT NULL,
  `geo_isp` varchar(200) NOT NULL,
  `geo_lat` double DEFAULT NULL,
  `geo_lon` double DEFAULT NULL,
  `status` varchar(20) NOT NULL,
  `reviewed_at` datetime(6) DEFAULT NULL,
  `reject_reason` longtext NOT NULL,
  `reviewed_by_id` bigint(20) DEFAULT NULL,
  `user_id` bigint(20) NOT NULL,
  `kyc_type` varchar(10) NOT NULL,
  `id_proof_file` varchar(100) DEFAULT NULL,
  `id_proof_type` varchar(30) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`),
  KEY `authapp_kyc_status_70219e_idx` (`status`,`submitted_at`),
  KEY `authapp_kycsubmission_reviewed_by_id_1499776b_fk_authapp_user_id` (`reviewed_by_id`),
  KEY `authapp_kycsubmission_status_7f87c7bd` (`status`),
  KEY `authapp_kycsubmission_kyc_type_71646161` (`kyc_type`),
  CONSTRAINT `authapp_kycsubmission_reviewed_by_id_1499776b_fk_authapp_user_id` FOREIGN KEY (`reviewed_by_id`) REFERENCES `authapp_user` (`id`),
  CONSTRAINT `authapp_kycsubmission_user_id_cc4bb334_fk_authapp_user_id` FOREIGN KEY (`user_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_kycsubmission` WRITE;
/*!40000 ALTER TABLE `authapp_kycsubmission` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_kycsubmission` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_landingsettings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_landingsettings` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `hero_badge_text` varchar(200) NOT NULL,
  `hero_background_video` varchar(100) DEFAULT NULL,
  `hero_cta_primary_label` varchar(60) NOT NULL,
  `hero_cta_secondary_label` varchar(60) NOT NULL,
  `hero_tagline` varchar(100) NOT NULL,
  `global_reach_tagline` varchar(200) NOT NULL,
  `trust_banner_heading` varchar(200) NOT NULL,
  `trust_banner_subtext` longtext NOT NULL,
  `whatsapp_number` varchar(20) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_landingsettings` WRITE;
/*!40000 ALTER TABLE `authapp_landingsettings` DISABLE KEYS */;
INSERT INTO `authapp_landingsettings` VALUES
(1,'Asia\'s #1 Offline Casino\'s VIP\'s Platform','','? Register — FREE','Packages ?','www.jackpotsworld.casino','Experience World-Class Casino Gaming Across','Join 50,000+ Winning Players Across Asia','From first-time casino visitors to high-rollers — Jackpots World is your trusted partner for every bet.','917795281999','2026-07-12 13:28:03.502141');
/*!40000 ALTER TABLE `authapp_landingsettings` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_notification`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_notification` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `message` longtext NOT NULL,
  `icon` varchar(50) NOT NULL,
  `is_read` tinyint(1) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `user_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_not_user_id_9ba27b_idx` (`user_id`,`is_read`),
  KEY `authapp_not_user_id_0c3dfe_idx` (`user_id`,`created_at`),
  CONSTRAINT `authapp_notification_user_id_a4142a13_fk_authapp_user_id` FOREIGN KEY (`user_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_notification` WRITE;
/*!40000 ALTER TABLE `authapp_notification` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_notification` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_offlinedepositlog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_offlinedepositlog` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `entry_type` varchar(20) NOT NULL,
  `casino_name` varchar(120) NOT NULL,
  `vip_level_at_time` int(11) NOT NULL,
  `slip_number` varchar(100) DEFAULT NULL,
  `betting_date` date DEFAULT NULL,
  `total_deposited` decimal(14,2) NOT NULL,
  `total_won` decimal(14,2) NOT NULL,
  `total_withdrawn` decimal(14,2) NOT NULL,
  `available_balance` decimal(14,2) NOT NULL,
  `total_bets` int(11) NOT NULL,
  `total_bet_amount` decimal(10,2) NOT NULL,
  `rp_rate` double NOT NULL,
  `rolling_pct` double NOT NULL,
  `rolling_points_added` decimal(14,2) NOT NULL,
  `rolling_points_total` decimal(14,2) NOT NULL,
  `levelup_points_needed` int(11) NOT NULL,
  `level_up_triggered` tinyint(1) NOT NULL,
  `note` longtext NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `recorded_by_id` bigint(20) DEFAULT NULL,
  `user_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slip_number` (`slip_number`),
  KEY `authapp_off_user_id_c416da_idx` (`user_id`,`entry_type`,`created_at`),
  KEY `authapp_offlinedepos_recorded_by_id_9b88f5d0_fk_authapp_u` (`recorded_by_id`),
  KEY `authapp_offlinedepositlog_entry_type_7bab5077` (`entry_type`),
  KEY `authapp_offlinedepositlog_level_up_triggered_12a593e9` (`level_up_triggered`),
  KEY `authapp_offlinedepositlog_created_at_b6906e16` (`created_at`),
  CONSTRAINT `authapp_offlinedepos_recorded_by_id_9b88f5d0_fk_authapp_u` FOREIGN KEY (`recorded_by_id`) REFERENCES `authapp_user` (`id`),
  CONSTRAINT `authapp_offlinedepositlog_user_id_8fc9892b_fk_authapp_user_id` FOREIGN KEY (`user_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_offlinedepositlog` WRITE;
/*!40000 ALTER TABLE `authapp_offlinedepositlog` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_offlinedepositlog` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_otprecord`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_otprecord` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `email` varchar(254) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `otp` varchar(6) NOT NULL,
  `mode` varchar(10) NOT NULL,
  `is_used` tinyint(1) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `expires_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_otprecord_email_73776933` (`email`),
  KEY `authapp_otprecord_created_at_2c74c540` (`created_at`),
  KEY `authapp_otp_email_6c4470_idx` (`email`,`is_used`,`expires_at`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_otprecord` WRITE;
/*!40000 ALTER TABLE `authapp_otprecord` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_otprecord` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_pendingadmincreation`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_pendingadmincreation` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `email` varchar(254) NOT NULL,
  `name` varchar(200) NOT NULL,
  `password` varchar(500) NOT NULL,
  `role` varchar(50) NOT NULL,
  `mobile` varchar(20) NOT NULL,
  `department` varchar(100) NOT NULL,
  `otp` varchar(10) NOT NULL,
  `expires_at` datetime(6) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `initiated_by_id` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `authapp_pendingadmin_initiated_by_id_955177bc_fk_authapp_u` (`initiated_by_id`),
  CONSTRAINT `authapp_pendingadmin_initiated_by_id_955177bc_fk_authapp_u` FOREIGN KEY (`initiated_by_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_pendingadmincreation` WRITE;
/*!40000 ALTER TABLE `authapp_pendingadmincreation` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_pendingadmincreation` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_pointslog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_pointslog` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `points_added` int(11) NOT NULL,
  `points_before` bigint(20) unsigned NOT NULL CHECK (`points_before` >= 0),
  `points_after` bigint(20) unsigned NOT NULL CHECK (`points_after` >= 0),
  `level_before` int(10) unsigned NOT NULL CHECK (`level_before` >= 0),
  `level_after` int(10) unsigned NOT NULL CHECK (`level_after` >= 0),
  `leveled_up` tinyint(1) NOT NULL,
  `reason` longtext NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `recorded_by_id` bigint(20) DEFAULT NULL,
  `user_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_pointslog_recorded_by_id_b5188288_fk_authapp_user_id` (`recorded_by_id`),
  KEY `authapp_pointslog_user_id_612210e9_fk_authapp_user_id` (`user_id`),
  KEY `authapp_pointslog_created_at_51daaec3` (`created_at`),
  CONSTRAINT `authapp_pointslog_recorded_by_id_b5188288_fk_authapp_user_id` FOREIGN KEY (`recorded_by_id`) REFERENCES `authapp_user` (`id`),
  CONSTRAINT `authapp_pointslog_user_id_612210e9_fk_authapp_user_id` FOREIGN KEY (`user_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_pointslog` WRITE;
/*!40000 ALTER TABLE `authapp_pointslog` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_pointslog` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_pokerregistration`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_pokerregistration` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) NOT NULL,
  `user_id` bigint(20) NOT NULL,
  `tournament_id` bigint(20) NOT NULL,
  `admin_note` longtext NOT NULL,
  `status` varchar(12) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `authapp_pokerregistration_tournament_id_user_id_15a1619a_uniq` (`tournament_id`,`user_id`),
  KEY `authapp_pokerregistration_user_id_c3e02747_fk_authapp_user_id` (`user_id`),
  KEY `authapp_pokerregistration_status_558accc8` (`status`),
  CONSTRAINT `authapp_pokerregistr_tournament_id_2df3701d_fk_authapp_p` FOREIGN KEY (`tournament_id`) REFERENCES `authapp_pokertournament` (`id`),
  CONSTRAINT `authapp_pokerregistration_user_id_c3e02747_fk_authapp_user_id` FOREIGN KEY (`user_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_pokerregistration` WRITE;
/*!40000 ALTER TABLE `authapp_pokerregistration` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_pokerregistration` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_pokertournament`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_pokertournament` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `image` varchar(100) DEFAULT NULL,
  `name` varchar(200) NOT NULL,
  `casino_name` varchar(150) NOT NULL,
  `location` varchar(150) NOT NULL,
  `event_date` date NOT NULL,
  `event_time` time(6) DEFAULT NULL,
  `prize_pool` decimal(14,2) NOT NULL,
  `buy_in` decimal(14,2) NOT NULL,
  `status` varchar(20) NOT NULL,
  `description` longtext NOT NULL,
  `seats_available` int(10) unsigned DEFAULT NULL CHECK (`seats_available` >= 0),
  `is_active` tinyint(1) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `created_by_id` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_pok_is_acti_a30ab6_idx` (`is_active`,`event_date`),
  KEY `authapp_pokertournam_created_by_id_8e0161b3_fk_authapp_u` (`created_by_id`),
  KEY `authapp_pokertournament_event_date_7a3ee6cf` (`event_date`),
  KEY `authapp_pokertournament_status_8fbeb0b3` (`status`),
  KEY `authapp_pokertournament_is_active_34f0f97c` (`is_active`),
  CONSTRAINT `authapp_pokertournam_created_by_id_8e0161b3_fk_authapp_u` FOREIGN KEY (`created_by_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_pokertournament` WRITE;
/*!40000 ALTER TABLE `authapp_pokertournament` DISABLE KEYS */;
INSERT INTO `authapp_pokertournament` VALUES
(1,'','WSOP Main Event — $10,000 No-Limit Hold\'em','Horseshoe Las Vegas','Las Vegas, United States','2026-07-02','11:00:00.000000',90000000.00,10000.00,'live','The world\'s most prestigious poker tournament — winner takes home a WSOP bracelet and the top prize from a multi-million dollar pool.',400,1,'2026-07-12 13:28:01.282759','2026-07-12 13:28:01.282772',NULL),
(2,'','WSOP Europe Main Event — €10,000 No-Limit Hold\'em','King\'s Casino Rozvadov','Rozvadov, Czech Republic','2026-10-20','12:00:00.000000',8000000.00,10000.00,'upcoming','Europe\'s flagship WSOP stop, drawing the continent\'s best for a week of high-stakes bracelet poker.',250,1,'2026-07-12 13:28:01.282806','2026-07-12 13:28:01.282813',NULL),
(3,'','WPT World Championship — $10,400 No-Limit Hold\'em','Wynn Las Vegas','Las Vegas, United States','2026-12-10','10:00:00.000000',15000000.00,10400.00,'upcoming','The season-ending WPT Championship event, broadcast worldwide with a seven-figure top prize.',300,1,'2026-07-12 13:28:01.282842','2026-07-12 13:28:01.282849',NULL),
(4,'','EPT Barcelona Main Event — €5,300 No-Limit Hold\'em','Casino Barcelona','Barcelona, Spain','2026-08-24','12:00:00.000000',6000000.00,5300.00,'upcoming','One of the EPT calendar\'s most popular Main Events, held on the Barcelona waterfront.',350,1,'2026-07-12 13:28:01.282879','2026-07-12 13:28:01.282886',NULL),
(5,'','PokerStars Caribbean Adventure Main Event — $10,300','Atlantis Resort','Nassau, Bahamas','2027-01-12','11:00:00.000000',8000000.00,10300.00,'upcoming','PokerStars\' iconic winter Main Event on Paradise Island.',300,1,'2026-07-12 13:28:01.282912','2026-07-12 13:28:01.282920',NULL),
(6,'','GG Poker WSOP Online Bracelet Event','GGPoker','Online — hosted via GGNetwork','2026-07-20','19:00:00.000000',2000000.00,1050.00,'upcoming','GGPoker\'s official online WSOP bracelet event, open to qualified players worldwide.',NULL,1,'2026-07-12 13:28:01.282959','2026-07-12 13:28:01.282966',NULL),
(7,'','Triton Poker Series Jeju — HK$100,000 Main Event','Landing Casino','Jeju, South Korea','2026-09-12','13:00:00.000000',12000000.00,12800.00,'upcoming','The Triton Series\' signature high-roller event, attracting the game\'s biggest names.',120,1,'2026-07-12 13:28:01.282993','2026-07-12 13:28:01.282999',NULL),
(8,'','APT Manila Main Event — ?25,000,000 Guaranteed','Okada Manila','Manila, Philippines','2026-08-09','14:00:00.000000',450000.00,550.00,'upcoming','The Asian Poker Tour\'s home-leg Main Event with a guaranteed eight-figure peso prize pool.',500,1,'2026-07-12 13:28:01.283026','2026-07-12 13:28:01.283032',NULL);
/*!40000 ALTER TABLE `authapp_pokertournament` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_promotion`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_promotion` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `country` varchar(100) NOT NULL,
  `country_code` varchar(8) NOT NULL,
  `casino_name` varchar(150) NOT NULL,
  `casino_logo` varchar(100) DEFAULT NULL,
  `image` varchar(100) DEFAULT NULL,
  `title` varchar(200) NOT NULL,
  `description` longtext NOT NULL,
  `validity_text` varchar(150) NOT NULL,
  `bonus_details` varchar(300) NOT NULL,
  `benefits` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`benefits`)),
  `cta_label` varchar(60) NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `order` int(10) unsigned NOT NULL CHECK (`order` >= 0),
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `created_by_id` bigint(20) DEFAULT NULL,
  `terms_conditions` longtext NOT NULL,
  `video` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_pro_is_acti_f40b56_idx` (`is_active`,`country`),
  KEY `authapp_promotion_created_by_id_3773c791_fk_authapp_user_id` (`created_by_id`),
  KEY `authapp_promotion_country_91b527b1` (`country`),
  KEY `authapp_promotion_is_active_5ba3d8e9` (`is_active`),
  CONSTRAINT `authapp_promotion_created_by_id_3773c791_fk_authapp_user_id` FOREIGN KEY (`created_by_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_promotion` WRITE;
/*!40000 ALTER TABLE `authapp_promotion` DISABLE KEYS */;
INSERT INTO `authapp_promotion` VALUES
(1,'India','IN','Deltin Royale','','','150% Welcome Rolling Bonus','','Valid for new sign-ups, 30 days','Get 150% rolling bonus credit on your first cash deposit at Deltin Royale.','[\"Up to \\u20b975,000 bonus credit\", \"Instant activation\", \"Valid on all table games\"]','Claim Bonus',1,1,'2026-07-12 13:28:01.284608','2026-07-12 13:28:01.284623',NULL,'',NULL),
(2,'India','IN','Casino Pride','','','Weekend Double Rolling Points','','Every Friday–Sunday','Earn double rolling points on all weekend play at Casino Pride, Goa.','[\"2x rolling points Fri-Sun\", \"Faster VIP tier progress\", \"Free weekend brunch for VIP\"]','Learn More',1,2,'2026-07-12 13:28:01.284659','2026-07-12 13:28:01.284667',NULL,'',NULL),
(3,'Sri Lanka','LK','Bellagio Casino','','','100% First Deposit Match','','New players only, 14 days','Dollar-for-dollar match on your first cash deposit at Bellagio Casino Colombo.','[\"Up to $2,000 match bonus\", \"Same-day wallet credit\", \"Dedicated VIP host\"]','Claim Bonus',1,1,'2026-07-12 13:28:01.284699','2026-07-12 13:28:01.284706',NULL,'',NULL),
(4,'Sri Lanka','LK','Ballys Casino','','','Colombo High-Roller Invite Nights','','Monthly, invite-only','Complimentary invite to Ballys Casino\'s monthly high-roller gala evening.','[\"Free entry for VIP tiers\", \"Complimentary dining\", \"Exclusive tournament seat\"]','Request Invite',1,2,'2026-07-12 13:28:01.284742','2026-07-12 13:28:01.284751',NULL,'',NULL),
(5,'Vietnam','VN','Casino Corona','','','200% Rolling Bonus — Phu Quoc','','Valid for 45 days','New players at Casino Corona Phu Quoc receive a 200% rolling bonus on arrival.','[\"Up to $5,000 bonus credit\", \"Complimentary airport pickup\", \"Resort room upgrade\"]','Claim Bonus',1,1,'2026-07-12 13:28:01.284787','2026-07-12 13:28:01.284796',NULL,'',NULL),
(6,'Vietnam','VN','The Grand Ho Tram','','','VIP Beach Resort Package','','Ongoing for VIP Gold+','Complimentary 2-night beach resort stay for Gold-tier and above players.','[\"Free 2-night stay\", \"Private beach cabana\", \"Daily resort credit\"]','Learn More',1,2,'2026-07-12 13:28:01.284832','2026-07-12 13:28:01.284841',NULL,'',NULL),
(7,'Macau','MO','Wynn Macau','','','Golden Week Rolling Bonus','','Limited-time seasonal offer','Earn an enhanced rolling percentage across all table games at Wynn Macau.','[\"Boosted rolling %\", \"Luxury suite upgrade for VIP\", \"Private gaming salon access\"]','Claim Bonus',1,1,'2026-07-12 13:28:01.284876','2026-07-12 13:28:01.284885',NULL,'',NULL),
(8,'Macau','MO','The Venetian','','','Cotai High Roller Program','','Ongoing for VIP tiers','Dedicated high-roller program at The Venetian Macau with tailored limits.','[\"Custom credit limits\", \"Private jet transfer assistance\", \"24/7 VIP host\"]','Learn More',1,2,'2026-07-12 13:28:01.284934','2026-07-12 13:28:01.284948',NULL,'',NULL),
(9,'Philippines','PH','Okada Manila','','','120% Welcome Rolling Bonus','','New sign-ups, 30 days','Get a 120% rolling bonus on your first cash deposit at Okada Manila.','[\"Up to \\u20b1150,000 bonus credit\", \"Instant activation\", \"Valid on all table games\"]','Claim Bonus',1,1,'2026-07-12 13:28:01.284988','2026-07-12 13:28:01.284996',NULL,'',NULL),
(10,'Philippines','PH','Solaire Resorts & Casino','','','Manila Bay VIP Nights','','Monthly, invite-only','Complimentary invite to Solaire\'s monthly VIP gala evening overlooking Manila Bay.','[\"Free entry for VIP tiers\", \"Complimentary dining\", \"Exclusive tournament seat\"]','Request Invite',1,2,'2026-07-12 13:28:01.285025','2026-07-12 13:28:01.285032',NULL,'',NULL);
/*!40000 ALTER TABLE `authapp_promotion` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_promotiongalleryimage`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_promotiongalleryimage` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `image` varchar(100) NOT NULL,
  `order` int(10) unsigned NOT NULL CHECK (`order` >= 0),
  `created_at` datetime(6) NOT NULL,
  `promotion_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_promotiongal_promotion_id_2a76a9d6_fk_authapp_p` (`promotion_id`),
  CONSTRAINT `authapp_promotiongal_promotion_id_2a76a9d6_fk_authapp_p` FOREIGN KEY (`promotion_id`) REFERENCES `authapp_promotion` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_promotiongalleryimage` WRITE;
/*!40000 ALTER TABLE `authapp_promotiongalleryimage` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_promotiongalleryimage` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_referralcommission`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_referralcommission` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `source_transaction_ref` varchar(100) NOT NULL,
  `deposit_amount` decimal(14,2) NOT NULL,
  `commission_rate` decimal(5,2) NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `status` varchar(10) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `paid_at` datetime(6) DEFAULT NULL,
  `affiliate_id` bigint(20) NOT NULL,
  `referred_user_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_referralcomm_referred_user_id_3676e8b1_fk_authapp_u` (`referred_user_id`),
  KEY `authapp_referralcommission_status_fd2e3468` (`status`),
  KEY `authapp_ref_affilia_c4bf11_idx` (`affiliate_id`,`status`),
  CONSTRAINT `authapp_referralcomm_affiliate_id_cb6bc9b5_fk_authapp_u` FOREIGN KEY (`affiliate_id`) REFERENCES `authapp_user` (`id`),
  CONSTRAINT `authapp_referralcomm_referred_user_id_3676e8b1_fk_authapp_u` FOREIGN KEY (`referred_user_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_referralcommission` WRITE;
/*!40000 ALTER TABLE `authapp_referralcommission` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_referralcommission` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_registration`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_registration` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `full_name` varchar(200) NOT NULL,
  `country` varchar(100) NOT NULL,
  `whatsapp_number` varchar(20) NOT NULL,
  `destination` varchar(200) NOT NULL,
  `package` varchar(200) NOT NULL,
  `interested_in_vip_deals` tinyint(1) NOT NULL,
  `interested_in_pro_tips` tinyint(1) NOT NULL,
  `ip_address` char(39) DEFAULT NULL,
  `user_agent` longtext NOT NULL,
  `geo_country` varchar(100) NOT NULL,
  `geo_city` varchar(100) NOT NULL,
  `geo_region` varchar(100) NOT NULL,
  `geo_latitude` double DEFAULT NULL,
  `geo_longitude` double DEFAULT NULL,
  `geo_isp` varchar(200) NOT NULL,
  `geo_timezone` varchar(100) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_reg_country_27095f_idx` (`country`),
  KEY `authapp_reg_destina_c661d0_idx` (`destination`),
  KEY `authapp_reg_created_5f0c3f_idx` (`created_at`),
  KEY `authapp_reg_interes_7f924d_idx` (`interested_in_vip_deals`),
  KEY `authapp_reg_interes_ebe3f8_idx` (`interested_in_pro_tips`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_registration` WRITE;
/*!40000 ALTER TABLE `authapp_registration` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_registration` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_responsiblegamblingsettings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_responsiblegamblingsettings` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `deposit_limit_daily` decimal(12,2) DEFAULT NULL,
  `deposit_limit_weekly` decimal(12,2) DEFAULT NULL,
  `deposit_limit_monthly` decimal(12,2) DEFAULT NULL,
  `cooling_off_until` date DEFAULT NULL,
  `self_exclusion_until` date DEFAULT NULL,
  `updated_at` datetime(6) NOT NULL,
  `user_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`),
  CONSTRAINT `authapp_responsibleg_user_id_ac4cb184_fk_authapp_u` FOREIGN KEY (`user_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_responsiblegamblingsettings` WRITE;
/*!40000 ALTER TABLE `authapp_responsiblegamblingsettings` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_responsiblegamblingsettings` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_reward`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_reward` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `type` varchar(30) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `is_claimed` tinyint(1) NOT NULL,
  `is_locked` tinyint(1) NOT NULL,
  `lock_reason` varchar(255) NOT NULL,
  `expires_at` datetime(6) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `claimed_at` datetime(6) DEFAULT NULL,
  `description` varchar(255) NOT NULL,
  `user_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_rew_user_id_7e8cbf_idx` (`user_id`,`is_claimed`),
  KEY `authapp_reward_is_claimed_f2a3e199` (`is_claimed`),
  CONSTRAINT `authapp_reward_user_id_1c857575_fk_authapp_user_id` FOREIGN KEY (`user_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_reward` WRITE;
/*!40000 ALTER TABLE `authapp_reward` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_reward` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_spinconfig`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_spinconfig` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `label` varchar(100) NOT NULL,
  `reward_type` varchar(25) NOT NULL,
  `value` decimal(12,2) NOT NULL,
  `casino_name` varchar(150) NOT NULL,
  `weight` int(10) unsigned NOT NULL CHECK (`weight` >= 0),
  `is_jackpot` tinyint(1) NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `event_id` bigint(20) DEFAULT NULL,
  `image_url` varchar(200) NOT NULL,
  `tournament_id` bigint(20) DEFAULT NULL,
  `description` longtext NOT NULL,
  `image` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_spinconfig_is_jackpot_f8d47c0c` (`is_jackpot`),
  KEY `authapp_spinconfig_is_active_1ce62190` (`is_active`),
  KEY `authapp_spinconfig_event_id_feb56f2c_fk_authapp_casinoevent_id` (`event_id`),
  KEY `authapp_spinconfig_tournament_id_9a449d22_fk_authapp_p` (`tournament_id`),
  CONSTRAINT `authapp_spinconfig_event_id_feb56f2c_fk_authapp_casinoevent_id` FOREIGN KEY (`event_id`) REFERENCES `authapp_casinoevent` (`id`),
  CONSTRAINT `authapp_spinconfig_tournament_id_9a449d22_fk_authapp_p` FOREIGN KEY (`tournament_id`) REFERENCES `authapp_pokertournament` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_spinconfig` WRITE;
/*!40000 ALTER TABLE `authapp_spinconfig` DISABLE KEYS */;
INSERT INTO `authapp_spinconfig` VALUES
(1,'$5 Cash Bonus','cash_wallet_bonus',5.00,'',20,0,1,'2026-07-12 13:28:03.749062','2026-07-12 13:28:03.749088',NULL,'',NULL,'A little extra in your main wallet — spend it however you like.',''),
(2,'$10 Cash Bonus','cash_wallet_bonus',10.00,'',10,0,1,'2026-07-12 13:28:03.749686','2026-07-12 13:28:03.749699',NULL,'',NULL,'A bigger cash top-up straight to your wallet.',''),
(3,'50 Rolling Points','rolling_points',50.00,'',20,0,1,'2026-07-12 13:28:03.750101','2026-07-12 13:28:03.750113',NULL,'',NULL,'Boost your VIP progress with free Rolling Points.',''),
(4,'15% Cashback','cashback',15.00,'',15,0,1,'2026-07-12 13:28:03.750524','2026-07-12 13:28:03.750537',NULL,'',NULL,'Cashback credited straight to your cash wallet.',''),
(5,'$20 Bonus Credits','bonus_credits',20.00,'',15,0,1,'2026-07-12 13:28:03.750910','2026-07-12 13:28:03.750922',NULL,'',NULL,'Non-cash bonus credits added to your account.',''),
(6,'VIP Level Boost','vip_upgrade',0.00,'',5,0,1,'2026-07-12 13:28:03.751288','2026-07-12 13:28:03.751300',NULL,'',NULL,'Instantly climb one VIP tier — unlock the next level\'s perks.',''),
(7,'$25 Gift Voucher','gift_voucher',25.00,'',8,0,1,'2026-07-12 13:28:03.751661','2026-07-12 13:28:03.751673',NULL,'',NULL,'A gift voucher waiting for you in your Gifts tab.',''),
(8,'10% Discount Voucher','discount_coupon',10.00,'',8,0,1,'2026-07-12 13:28:03.752035','2026-07-12 13:28:03.752047',NULL,'',NULL,'A discount voucher waiting for you in your Gifts tab.',''),
(9,'Try Again','no_reward',0.00,'',30,0,1,'2026-07-12 13:28:03.752409','2026-07-12 13:28:03.752421',NULL,'',NULL,'So close! Come back tomorrow for another spin.',''),
(10,'MEGA JACKPOT','jackpot_bonus',500.00,'',10,1,1,'2026-07-12 13:28:03.752788','2026-07-12 13:28:03.752799',NULL,'',NULL,'The big one — a massive cash bonus credited instantly.','');
/*!40000 ALTER TABLE `authapp_spinconfig` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_spinglobalcounter`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_spinglobalcounter` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `updated_at` datetime(6) NOT NULL,
  `eligible_user_count` bigint(20) unsigned NOT NULL CHECK (`eligible_user_count` >= 0),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_spinglobalcounter` WRITE;
/*!40000 ALTER TABLE `authapp_spinglobalcounter` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_spinglobalcounter` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_spinhistory`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_spinhistory` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `reward_type_snapshot` varchar(25) NOT NULL,
  `reward_label_snapshot` varchar(100) NOT NULL,
  `value_snapshot` decimal(12,2) NOT NULL,
  `is_jackpot_win` tinyint(1) NOT NULL,
  `global_counter_value` bigint(20) unsigned NOT NULL CHECK (`global_counter_value` >= 0),
  `month_key` varchar(7) NOT NULL,
  `needs_manual_fulfillment` tinyint(1) NOT NULL,
  `fulfilled_at` datetime(6) DEFAULT NULL,
  `spun_at` datetime(6) NOT NULL,
  `config_id` bigint(20) DEFAULT NULL,
  `user_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_spinhistory_config_id_bb3181c8_fk_authapp_spinconfig_id` (`config_id`),
  KEY `authapp_spinhistory_month_key_9e21ed27` (`month_key`),
  KEY `authapp_spinhistory_needs_manual_fulfillment_76842b5a` (`needs_manual_fulfillment`),
  KEY `authapp_spi_user_id_1d4554_idx` (`user_id`,`month_key`),
  CONSTRAINT `authapp_spinhistory_config_id_bb3181c8_fk_authapp_spinconfig_id` FOREIGN KEY (`config_id`) REFERENCES `authapp_spinconfig` (`id`),
  CONSTRAINT `authapp_spinhistory_user_id_de12515b_fk_authapp_user_id` FOREIGN KEY (`user_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_spinhistory` WRITE;
/*!40000 ALTER TABLE `authapp_spinhistory` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_spinhistory` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_spinsettings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_spinsettings` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `max_spins_per_month` int(10) unsigned NOT NULL CHECK (`max_spins_per_month` >= 0),
  `jackpot_every_n_users` int(10) unsigned NOT NULL CHECK (`jackpot_every_n_users` >= 0),
  `sound_enabled` tinyint(1) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_spinsettings` WRITE;
/*!40000 ALTER TABLE `authapp_spinsettings` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_spinsettings` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_superadmintransaction`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_superadmintransaction` (
  `id` uuid NOT NULL,
  `txn_type` varchar(20) NOT NULL,
  `wallet_type` varchar(3) NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `admin_wallet_before` decimal(18,2) NOT NULL,
  `admin_wallet_after` decimal(18,2) NOT NULL,
  `performed_by_email` varchar(254) NOT NULL,
  `target_user_uid` varchar(20) NOT NULL,
  `user_wallet_before` decimal(18,2) DEFAULT NULL,
  `user_wallet_after` decimal(18,2) DEFAULT NULL,
  `note` longtext NOT NULL,
  `reference` varchar(80) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `performed_by_id` bigint(20) DEFAULT NULL,
  `target_user_id` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `reference` (`reference`),
  KEY `authapp_sup_txn_typ_5d65d9_idx` (`txn_type`,`created_at`),
  KEY `authapp_sup_wallet__0a9d81_idx` (`wallet_type`,`created_at`),
  KEY `authapp_sup_perform_94d72b_idx` (`performed_by_id`,`created_at`),
  KEY `authapp_superadmintr_target_user_id_9cf0611e_fk_authapp_u` (`target_user_id`),
  KEY `authapp_superadmintransaction_txn_type_48d62136` (`txn_type`),
  KEY `authapp_superadmintransaction_wallet_type_7001175d` (`wallet_type`),
  KEY `authapp_superadmintransaction_created_at_164cb0b4` (`created_at`),
  CONSTRAINT `authapp_superadmintr_performed_by_id_46f42897_fk_authapp_u` FOREIGN KEY (`performed_by_id`) REFERENCES `authapp_user` (`id`),
  CONSTRAINT `authapp_superadmintr_target_user_id_9cf0611e_fk_authapp_u` FOREIGN KEY (`target_user_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_superadmintransaction` WRITE;
/*!40000 ALTER TABLE `authapp_superadmintransaction` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_superadmintransaction` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_supportedlocation`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_supportedlocation` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `country_code` varchar(8) NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `order` int(10) unsigned NOT NULL CHECK (`order` >= 0),
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_supportedlocation_is_active_180541c3` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_supportedlocation` WRITE;
/*!40000 ALTER TABLE `authapp_supportedlocation` DISABLE KEYS */;
INSERT INTO `authapp_supportedlocation` VALUES
(1,'Vietnam','VN',1,1,'2026-07-12 13:28:02.895682','2026-07-12 13:28:02.895711'),
(2,'Macau','MO',1,2,'2026-07-12 13:28:02.897236','2026-07-12 13:28:02.897251'),
(3,'India','IN',1,3,'2026-07-12 13:28:02.898558','2026-07-12 13:28:02.898574'),
(4,'Sri Lanka','LK',1,4,'2026-07-12 13:28:02.901573','2026-07-12 13:28:02.901589'),
(5,'Philippines','PH',1,5,'2026-07-12 13:28:02.904298','2026-07-12 13:28:02.904314');
/*!40000 ALTER TABLE `authapp_supportedlocation` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_supportticket`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_supportticket` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `subject` varchar(200) NOT NULL,
  `message` longtext NOT NULL,
  `status` varchar(15) NOT NULL,
  `admin_reply` longtext NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `user_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_supportticket_status_75b172d7` (`status`),
  KEY `authapp_sup_user_id_42d02d_idx` (`user_id`,`status`),
  CONSTRAINT `authapp_supportticket_user_id_85110de9_fk_authapp_user_id` FOREIGN KEY (`user_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_supportticket` WRITE;
/*!40000 ALTER TABLE `authapp_supportticket` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_supportticket` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_testimonial`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_testimonial` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `city` varchar(100) NOT NULL,
  `country_code` varchar(8) NOT NULL,
  `rating` smallint(5) unsigned NOT NULL CHECK (`rating` >= 0),
  `amount_won` varchar(40) NOT NULL,
  `destination` varchar(80) NOT NULL,
  `accent_color` varchar(20) NOT NULL,
  `avatar` varchar(100) DEFAULT NULL,
  `text` longtext NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `order` int(10) unsigned NOT NULL CHECK (`order` >= 0),
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_testimonial_is_active_282b1dee` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_testimonial` WRITE;
/*!40000 ALTER TABLE `authapp_testimonial` DISABLE KEYS */;
INSERT INTO `authapp_testimonial` VALUES
(1,'Rajesh K.','Mumbai, India','IN',5,'$8.5 Lakhs','Macau','#FF6F00','','Jackpots World made my Macau trip absolutely magical! VIP treatment from airport to casino floor. Won big at the Venetian Baccarat tables. The package was worth every rupee!',1,0,'2026-07-12 13:28:03.530823','2026-07-12 13:28:03.530835'),
(2,'Priya S.','Chennai, India','IN',5,'$2.2 Lakhs','Goa','#8E24AA','','First casino experience ever and it couldn\'t have been better. The Jackpots World team guided me through everything. Walked out with a massive win at Delta Corp roulette!',1,1,'2026-07-12 13:28:03.531446','2026-07-12 13:28:03.531459'),
(3,'Nguyen T.','Ho Chi Minh City','VN',5,'$4,200','Vietnam','#D32F2F','','The Diamond Elite package in Vietnam was extraordinary. Private butler, unlimited credits, and I hit the poker jackpot! Jackpots World is truly Asia\'s best.',1,2,'2026-07-12 13:28:03.531843','2026-07-12 13:28:03.531855'),
(4,'Arjun M.','Bangalore, India','IN',5,'$12 Lakhs','Philippines','#00838F','','Okada Manila with Jackpots World\'s VIP package — hands down the best experience of my life. Hit a jackpot on the Konami slots and the cashout was instant. 10/10!',1,3,'2026-07-12 13:28:03.532210','2026-07-12 13:28:03.532223'),
(5,'Kasun P.','Colombo, Sri Lanka','LK',5,'LKR 900K','Sri Lanka','#7B1FA2','','Bally\'s Colombo via Jackpots World was unreal. Got a VIP membership, exclusive table access, and walked away with a life-changing win. The support team was exceptional.',1,4,'2026-07-12 13:28:03.532580','2026-07-12 13:28:03.532592'),
(6,'Carlos R.','Manila, Philippines','PH',5,'?185,000','Philippines','#43A047','','City of Dreams Manila via Jackpots World — simply the BEST! Their concierge handled everything perfectly. Won big at Blackjack 21 and the payout was smooth.',1,5,'2026-07-12 13:28:03.532934','2026-07-12 13:28:03.532946');
/*!40000 ALTER TABLE `authapp_testimonial` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_tourpackage`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_tourpackage` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `name` varchar(60) NOT NULL,
  `price` varchar(30) NOT NULL,
  `icon` varchar(10) NOT NULL,
  `color` varchar(20) NOT NULL,
  `badge` varchar(40) NOT NULL,
  `duration` varchar(40) NOT NULL,
  `flight` varchar(60) NOT NULL,
  `hotel` varchar(80) NOT NULL,
  `food` varchar(60) NOT NULL,
  `liquor` varchar(100) NOT NULL,
  `airport_vip` tinyint(1) NOT NULL,
  `jackpot_rewards` tinyint(1) NOT NULL,
  `vip_transport` tinyint(1) NOT NULL,
  `vip_transport_note` varchar(10) NOT NULL,
  `spa` tinyint(1) NOT NULL,
  `spa_note` varchar(10) NOT NULL,
  `shopping_voucher` tinyint(1) NOT NULL,
  `shopping_note` varchar(10) NOT NULL,
  `visa` tinyint(1) NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `order` int(10) unsigned NOT NULL CHECK (`order` >= 0),
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_tourpackage_is_active_b0e25721` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_tourpackage` WRITE;
/*!40000 ALTER TABLE `authapp_tourpackage` DISABLE KEYS */;
INSERT INTO `authapp_tourpackage` VALUES
(1,'VIP','$5,000','?','#9E9E9E','','3 Nights','Economy','Standard 3? (3N)','Casino','Over the Gaming Table (Local)',0,1,0,'',0,'',0,'',0,1,0,'2026-07-12 13:28:03.547889','2026-07-12 13:28:03.547902'),
(2,'Classic','$10,000','?','#78909C','','3 Nights','Economy','Standard 4? (3N)','Casino','Over the Gaming Table (Local Premium)',0,1,0,'',1,'',0,'',1,1,1,'2026-07-12 13:28:03.548611','2026-07-12 13:28:03.548625'),
(3,'Premium','$15,000','?','#D4AF37','Popular','3 Nights','Economy','Standard 5? (3N)','Casino','Over the Gaming Table (Premium)',0,1,0,'',1,'',0,'',1,1,2,'2026-07-12 13:28:03.549099','2026-07-12 13:28:03.549113'),
(4,'Prestige','$20,000','?','#F5A623','','3 Nights','Economy','Executive 5? (3N)','Casino','Over the Gaming Table (Imported Premium)',0,1,0,'',1,'',0,'',1,1,3,'2026-07-12 13:28:03.549551','2026-07-12 13:28:03.549565'),
(5,'Signature','$25,000','??','#26C6DA','','3 Nights','Economy','Premium 5? (3N)','Casino','Over the Gaming Table (Imported Premium)',1,1,1,'',1,'',1,'',1,1,4,'2026-07-12 13:28:03.549959','2026-07-12 13:28:03.549972'),
(6,'Elite','$50,000','?','#B9F2FF','Best Value','3 Nights','Business','Suite 5? (3N)','Casino/Hotel','Imported Premium',1,1,1,'*',1,'*',1,'*',1,1,5,'2026-07-12 13:28:03.550389','2026-07-12 13:28:03.550404'),
(7,'Royal','$100,000','?','#FFD700','','4 Nights','Business','Executive Suite 5? (4N)','Casino/Hotel','Imported Premium',1,1,1,'**',1,'**',1,'**',1,1,6,'2026-07-12 13:28:03.550821','2026-07-12 13:28:03.550834'),
(8,'Sovereign','$250,000+','??','#C9A84C','? Invite Only','7 Nights','Business','Presidential Suite (7N)','Casino/Hotel','Imported Premium',1,1,1,'**',1,'***',1,'***',1,1,7,'2026-07-12 13:28:03.551229','2026-07-12 13:28:03.551241');
/*!40000 ALTER TABLE `authapp_tourpackage` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_trustbadge`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_trustbadge` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `icon_name` varchar(40) NOT NULL,
  `color` varchar(20) NOT NULL,
  `label` varchar(80) NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `order` int(10) unsigned NOT NULL CHECK (`order` >= 0),
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_trustbadge_is_active_79e314f6` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_trustbadge` WRITE;
/*!40000 ALTER TABLE `authapp_trustbadge` DISABLE KEYS */;
INSERT INTO `authapp_trustbadge` VALUES
(1,'CheckCircle','#34d399','Licensed Partners',1,0,'2026-07-12 13:28:03.512020','2026-07-12 13:28:03.512032'),
(2,'Lock','#60a5fa','SSL Secured',1,1,'2026-07-12 13:28:03.512506','2026-07-12 13:28:03.512519'),
(3,'BadgeCheck','#a78bfa','Fair Play Certified',1,2,'2026-07-12 13:28:03.512841','2026-07-12 13:28:03.512853'),
(4,'MapPin','#fbbf24','Pan-Asia Coverage',1,3,'2026-07-12 13:28:03.513174','2026-07-12 13:28:03.513186'),
(5,'Star','#D4AF37','5 Star Rated',1,4,'2026-07-12 13:28:03.513498','2026-07-12 13:28:03.513510');
/*!40000 ALTER TABLE `authapp_trustbadge` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_twofactorauth`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_twofactorauth` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `secret` varchar(64) NOT NULL,
  `is_enabled` tinyint(1) NOT NULL,
  `confirmed_at` datetime(6) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `user_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`),
  KEY `authapp_twofactorauth_is_enabled_d2326d49` (`is_enabled`),
  CONSTRAINT `authapp_twofactorauth_user_id_c2096c06_fk_authapp_user_id` FOREIGN KEY (`user_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_twofactorauth` WRITE;
/*!40000 ALTER TABLE `authapp_twofactorauth` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_twofactorauth` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_twofactorbackupcode`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_twofactorbackupcode` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `code_hash` varchar(128) NOT NULL,
  `used_at` datetime(6) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `two_factor_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_two_two_fac_e1b0fe_idx` (`two_factor_id`,`used_at`),
  CONSTRAINT `authapp_twofactorbac_two_factor_id_52183a2f_fk_authapp_t` FOREIGN KEY (`two_factor_id`) REFERENCES `authapp_twofactorauth` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_twofactorbackupcode` WRITE;
/*!40000 ALTER TABLE `authapp_twofactorbackupcode` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_twofactorbackupcode` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_user` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `password` varchar(128) NOT NULL,
  `is_superuser` tinyint(1) NOT NULL,
  `user_uid` varchar(10) NOT NULL,
  `email` varchar(254) NOT NULL,
  `name` varchar(120) NOT NULL,
  `country` varchar(2) NOT NULL,
  `phone` varchar(20) NOT NULL,
  `dial_code` varchar(6) NOT NULL,
  `date_of_birth` date DEFAULT NULL,
  `profile_last_updated` datetime(6) DEFAULT NULL,
  `profile_locked_until` datetime(6) DEFAULT NULL,
  `avatar` varchar(100) DEFAULT NULL,
  `avatar_url` varchar(200) DEFAULT NULL,
  `vip_level` smallint(5) unsigned NOT NULL CHECK (`vip_level` >= 0),
  `vip_xp` int(11) NOT NULL,
  `wallet_balance` decimal(14,2) NOT NULL,
  `bonus_balance` decimal(14,2) NOT NULL,
  `total_deposited` decimal(14,2) NOT NULL,
  `total_withdrawn` decimal(14,2) NOT NULL,
  `total_won` decimal(14,2) NOT NULL,
  `rolling_points_total` decimal(14,2) NOT NULL,
  `referral_code` varchar(12) NOT NULL,
  `referral_code_used` varchar(12) NOT NULL,
  `referral_count` int(11) NOT NULL,
  `referral_earnings` decimal(14,2) NOT NULL,
  `kyc_status` varchar(20) NOT NULL,
  `is_verified` tinyint(1) NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `is_staff` tinyint(1) NOT NULL,
  `date_joined` datetime(6) NOT NULL,
  `last_login` datetime(6) DEFAULT NULL,
  `last_login_ip` char(39) DEFAULT NULL,
  `referred_by_id` bigint(20) DEFAULT NULL,
  `preferred_language` varchar(8) NOT NULL,
  `last_login_city` varchar(100) NOT NULL,
  `last_login_country_name` varchar(100) NOT NULL,
  `last_login_region` varchar(100) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_uid` (`user_uid`),
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `referral_code` (`referral_code`),
  KEY `authapp_use_vip_lev_03a524_idx` (`vip_level`,`is_active`),
  KEY `authapp_use_kyc_sta_fa0841_idx` (`kyc_status`,`date_joined`),
  KEY `authapp_use_date_jo_3ec3fd_idx` (`date_joined`),
  KEY `authapp_use_country_0ab0a0_idx` (`country`,`is_active`),
  KEY `authapp_user_referred_by_id_3f2ec361_fk_authapp_user_id` (`referred_by_id`),
  KEY `authapp_user_country_836f3db1` (`country`),
  KEY `authapp_user_phone_efdb2f9b` (`phone`),
  KEY `authapp_user_vip_level_605c9f04` (`vip_level`),
  KEY `authapp_user_kyc_status_89b94b0f` (`kyc_status`),
  KEY `authapp_user_is_active_37df9634` (`is_active`),
  KEY `authapp_user_date_joined_39c003ce` (`date_joined`),
  KEY `authapp_user_last_login_054e599a` (`last_login`),
  CONSTRAINT `authapp_user_referred_by_id_3f2ec361_fk_authapp_user_id` FOREIGN KEY (`referred_by_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_user` WRITE;
/*!40000 ALTER TABLE `authapp_user` DISABLE KEYS */;
INSERT INTO `authapp_user` VALUES
(1,'pbkdf2_sha256$1000000$n9Pz4ytsIVYT4XczcXOxJe$WMtyqaxi2OCYrKJTUywM6hxqe4A2bOdyHQr6XBuilrg=',1,'WINKB95','superadmin@jackpotsworld.vip','Super Admin','','','',NULL,NULL,NULL,'',NULL,1,0,0.00,0.00,0.00,0.00,0.00,0.00,'5YZJE7IA','',0,0.00,'pending',0,1,1,'2026-07-12 13:29:42.526007',NULL,NULL,NULL,'en','','',''),
(2,'pbkdf2_sha256$1000000$PtS5l1s9x1NZQEwIgUuWLh$uvTACRjRUHWGtaAS2VhL0mkOuz0eBOTRd3cpFHulFb0=',0,'WINWN30','admin@jackpotsworld.vip','Admin','','','',NULL,NULL,NULL,'',NULL,1,0,0.00,0.00,0.00,0.00,0.00,0.00,'2D6M519L','',0,0.00,'pending',0,1,1,'2026-07-12 13:29:42.838232',NULL,NULL,NULL,'en','','','');
/*!40000 ALTER TABLE `authapp_user` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_user_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_user_groups` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `group_id` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `authapp_user_groups_user_id_group_id_532435ff_uniq` (`user_id`,`group_id`),
  KEY `authapp_user_groups_group_id_361087d7_fk_auth_group_id` (`group_id`),
  CONSTRAINT `authapp_user_groups_group_id_361087d7_fk_auth_group_id` FOREIGN KEY (`group_id`) REFERENCES `auth_group` (`id`),
  CONSTRAINT `authapp_user_groups_user_id_aad8a001_fk_authapp_user_id` FOREIGN KEY (`user_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_user_groups` WRITE;
/*!40000 ALTER TABLE `authapp_user_groups` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_user_groups` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_user_user_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_user_user_permissions` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `permission_id` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `authapp_user_user_permis_user_id_permission_id_d73ed934_uniq` (`user_id`,`permission_id`),
  KEY `authapp_user_user_pe_permission_id_ea3ff82e_fk_auth_perm` (`permission_id`),
  CONSTRAINT `authapp_user_user_pe_permission_id_ea3ff82e_fk_auth_perm` FOREIGN KEY (`permission_id`) REFERENCES `auth_permission` (`id`),
  CONSTRAINT `authapp_user_user_pe_user_id_fb111ce4_fk_authapp_u` FOREIGN KEY (`user_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_user_user_permissions` WRITE;
/*!40000 ALTER TABLE `authapp_user_user_permissions` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_user_user_permissions` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_usergift`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_usergift` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `amount` decimal(14,2) NOT NULL,
  `gift_type` varchar(30) NOT NULL,
  `status` varchar(10) NOT NULL,
  `description` longtext NOT NULL,
  `note` longtext NOT NULL,
  `expires_at` datetime(6) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `claimed_at` datetime(6) DEFAULT NULL,
  `created_by_id` bigint(20) DEFAULT NULL,
  `user_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_use_user_id_1900e9_idx` (`user_id`,`status`,`created_at`),
  KEY `authapp_usergift_created_by_id_4192c212_fk_authapp_user_id` (`created_by_id`),
  KEY `authapp_usergift_status_fe27eb8e` (`status`),
  KEY `authapp_usergift_created_at_93d9aaf9` (`created_at`),
  CONSTRAINT `authapp_usergift_created_by_id_4192c212_fk_authapp_user_id` FOREIGN KEY (`created_by_id`) REFERENCES `authapp_user` (`id`),
  CONSTRAINT `authapp_usergift_user_id_ab32196b_fk_authapp_user_id` FOREIGN KEY (`user_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_usergift` WRITE;
/*!40000 ALTER TABLE `authapp_usergift` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_usergift` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_userlevel`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_userlevel` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `level` int(10) unsigned NOT NULL CHECK (`level` >= 0),
  `points` bigint(20) unsigned NOT NULL CHECK (`points` >= 0),
  `updated_at` datetime(6) NOT NULL,
  `updated_by_id` bigint(20) DEFAULT NULL,
  `user_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`),
  KEY `authapp_userlevel_updated_by_id_bb792c37_fk_authapp_user_id` (`updated_by_id`),
  KEY `authapp_userlevel_level_436d701e` (`level`),
  CONSTRAINT `authapp_userlevel_updated_by_id_bb792c37_fk_authapp_user_id` FOREIGN KEY (`updated_by_id`) REFERENCES `authapp_user` (`id`),
  CONSTRAINT `authapp_userlevel_user_id_ac127530_fk_authapp_user_id` FOREIGN KEY (`user_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_userlevel` WRITE;
/*!40000 ALTER TABLE `authapp_userlevel` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_userlevel` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_vipserviceimage`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_vipserviceimage` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `image` varchar(100) NOT NULL,
  `label` varchar(100) NOT NULL,
  `category` varchar(60) NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `order` int(10) unsigned NOT NULL CHECK (`order` >= 0),
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_vipserviceimage_is_active_51cc41af` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_vipserviceimage` WRITE;
/*!40000 ALTER TABLE `authapp_vipserviceimage` DISABLE KEYS */;
INSERT INTO `authapp_vipserviceimage` VALUES
(1,'','Classic Massage','Wellness',1,0,'2026-07-12 13:28:03.542674','2026-07-12 13:28:03.542687'),
(2,'','Luxury Spa','Wellness',1,1,'2026-07-12 13:28:03.543263','2026-07-12 13:28:03.543276'),
(3,'','Premium Bar Counter','Bar & Drinks',1,2,'2026-07-12 13:28:03.543738','2026-07-12 13:28:03.543751'),
(4,'','Exclusive Cellar','Bar & Drinks',1,3,'2026-07-12 13:28:03.544087','2026-07-12 13:28:03.544099'),
(5,'','Live Dance Show','Entertainment',1,4,'2026-07-12 13:28:03.544456','2026-07-12 13:28:03.544472'),
(6,'','VIP Stage & Lounge','Entertainment',1,5,'2026-07-12 13:28:03.544823','2026-07-12 13:28:03.544836'),
(7,'','VIP Lounge Access','VIP Lounge',1,6,'2026-07-12 13:28:03.545169','2026-07-12 13:28:03.545184'),
(8,'','Private Suite Lounge','VIP Lounge',1,7,'2026-07-12 13:28:03.545522','2026-07-12 13:28:03.545535'),
(9,'','Exclusive VIP Room','VIP Rooms',1,8,'2026-07-12 13:28:03.545860','2026-07-12 13:28:03.545873'),
(10,'','High Roller Room','VIP Rooms',1,9,'2026-07-12 13:28:03.546218','2026-07-12 13:28:03.546233'),
(11,'','Private Jet','Luxury Travel',1,10,'2026-07-12 13:28:03.546652','2026-07-12 13:28:03.546665'),
(12,'','Luxury Cruises','Luxury Travel',1,11,'2026-07-12 13:28:03.546991','2026-07-12 13:28:03.547004'),
(13,'','Private Boats','Luxury Travel',1,12,'2026-07-12 13:28:03.547334','2026-07-12 13:28:03.547348');
/*!40000 ALTER TABLE `authapp_vipserviceimage` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_viptier`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_viptier` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `label` varchar(60) NOT NULL,
  `accent_color` varchar(20) NOT NULL,
  `accent_bg` varchar(20) NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `order` int(10) unsigned NOT NULL CHECK (`order` >= 0),
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_viptier_is_active_42421c00` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_viptier` WRITE;
/*!40000 ALTER TABLE `authapp_viptier` DISABLE KEYS */;
INSERT INTO `authapp_viptier` VALUES
(1,'Bronze','#92400e','#fef3c7',1,0,'2026-07-12 13:28:03.517518','2026-07-12 13:28:03.517531'),
(2,'Silver','#374151','#f3f4f6',1,1,'2026-07-12 13:28:03.519078','2026-07-12 13:28:03.519090'),
(3,'Gold','#78350f','#fef9c3',1,2,'2026-07-12 13:28:03.520412','2026-07-12 13:28:03.520424'),
(4,'Jackpot I','#1e3a8a','#eff6ff',1,3,'2026-07-12 13:28:03.521687','2026-07-12 13:28:03.521699'),
(5,'Jackpot II','#1e3a8a','#eff6ff',1,4,'2026-07-12 13:28:03.523240','2026-07-12 13:28:03.523252'),
(6,'Jackpot III','#1e3a8a','#eff6ff',1,5,'2026-07-12 13:28:03.525091','2026-07-12 13:28:03.525103'),
(7,'Platinum Jackpot','#1f2937','#f9fafb',1,6,'2026-07-12 13:28:03.526924','2026-07-12 13:28:03.526936'),
(8,'Diamond Jackpot','#1e3a8a','#dbeafe',1,7,'2026-07-12 13:28:03.528775','2026-07-12 13:28:03.528787');
/*!40000 ALTER TABLE `authapp_viptier` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_viptierbenefit`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_viptierbenefit` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `name` varchar(80) NOT NULL,
  `description` varchar(200) NOT NULL,
  `order` int(10) unsigned NOT NULL CHECK (`order` >= 0),
  `created_at` datetime(6) NOT NULL,
  `tier_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_viptierbenefit_tier_id_a30b4304_fk_authapp_viptier_id` (`tier_id`),
  CONSTRAINT `authapp_viptierbenefit_tier_id_a30b4304_fk_authapp_viptier_id` FOREIGN KEY (`tier_id`) REFERENCES `authapp_viptier` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=33 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_viptierbenefit` WRITE;
/*!40000 ALTER TABLE `authapp_viptierbenefit` DISABLE KEYS */;
INSERT INTO `authapp_viptierbenefit` VALUES
(1,'Level Up Bonus','One-time bonus credited when you reach this tier',0,'2026-07-12 13:28:03.518199',1),
(2,'Weekly Bonus','Weekly reward credited based on your activity',1,'2026-07-12 13:28:03.518740',1),
(3,'Level Up Bonus','One-time bonus credited when you reach this tier',0,'2026-07-12 13:28:03.519438',2),
(4,'Weekly Bonus','Weekly reward credited based on your activity',1,'2026-07-12 13:28:03.519783',2),
(5,'Monthly Bonus','Monthly loyalty bonus added to your balance',2,'2026-07-12 13:28:03.520092',2),
(6,'Level Up Bonus','One-time bonus credited when you reach this tier',0,'2026-07-12 13:28:03.520749',3),
(7,'Weekly Bonus','Weekly reward credited based on your activity',1,'2026-07-12 13:28:03.521053',3),
(8,'Monthly Bonus','Monthly loyalty bonus added to your balance',2,'2026-07-12 13:28:03.521372',3),
(9,'Level Up Bonus','One-time bonus credited when you reach this tier',0,'2026-07-12 13:28:03.522003',4),
(10,'Weekly Bonus','Weekly reward credited based on your activity',1,'2026-07-12 13:28:03.522321',4),
(11,'Monthly Bonus','Monthly loyalty bonus added to your balance',2,'2026-07-12 13:28:03.522633',4),
(12,'Extras','Exclusive privileges and special access perks',3,'2026-07-12 13:28:03.522938',4),
(13,'Level Up Bonus','One-time bonus credited when you reach this tier',0,'2026-07-12 13:28:03.523565',5),
(14,'Weekly Bonus','Weekly reward credited based on your activity',1,'2026-07-12 13:28:03.523873',5),
(15,'Monthly Bonus','Monthly loyalty bonus added to your balance',2,'2026-07-12 13:28:03.524182',5),
(16,'Extras','Exclusive privileges and special access perks',3,'2026-07-12 13:28:03.524482',5),
(17,'VIP Host Luxury Gifts','Gurated gifts delivered by your personal VIP host',4,'2026-07-12 13:28:03.524800',5),
(18,'Level Up Bonus','One-time bonus credited when you reach this tier',0,'2026-07-12 13:28:03.525424',6),
(19,'Weekly Bonus','Weekly reward credited based on your activity',1,'2026-07-12 13:28:03.525737',6),
(20,'Monthly Bonus','Monthly loyalty bonus added to your balance',2,'2026-07-12 13:28:03.526031',6),
(21,'Extras','Exclusive privileges and special access perks',3,'2026-07-12 13:28:03.526333',6),
(22,'VIP Host Luxury Gifts','Gurated gifts delivered by your personal VIP host',4,'2026-07-12 13:28:03.526627',6),
(23,'Level Up Bonus','One-time bonus credited when you reach this tier',0,'2026-07-12 13:28:03.527242',7),
(24,'Weekly Bonus','Weekly reward credited based on your activity',1,'2026-07-12 13:28:03.527557',7),
(25,'Monthly Bonus','Monthly loyalty bonus added to your balance',2,'2026-07-12 13:28:03.527860',7),
(26,'Extras','Exclusive privileges and special access perks',3,'2026-07-12 13:28:03.528163',7),
(27,'VIP Host Luxury Gifts','Gurated gifts delivered by your personal VIP host',4,'2026-07-12 13:28:03.528460',7),
(28,'Level Up Bonus','One-time bonus credited when you reach this tier',0,'2026-07-12 13:28:03.529082',8),
(29,'Weekly Bonus','Weekly reward credited based on your activity',1,'2026-07-12 13:28:03.529396',8),
(30,'Monthly Bonus','Monthly loyalty bonus added to your balance',2,'2026-07-12 13:28:03.529716',8),
(31,'Extras','Exclusive privileges and special access perks',3,'2026-07-12 13:28:03.530019',8),
(32,'VIP Host Luxury Gifts','Gurated gifts delivered by your personal VIP host',4,'2026-07-12 13:28:03.530355',8);
/*!40000 ALTER TABLE `authapp_viptierbenefit` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_walletaccount`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_walletaccount` (
  `id` uuid NOT NULL,
  `wallet_type` varchar(3) NOT NULL,
  `wallet_account_number` varchar(30) NOT NULL,
  `balance` decimal(14,2) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  `last_reason` varchar(10) NOT NULL,
  `updated_by_id` bigint(20) DEFAULT NULL,
  `user_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `wallet_account_number` (`wallet_account_number`),
  UNIQUE KEY `authapp_walletaccount_user_id_wallet_type_941fe9c6_uniq` (`user_id`,`wallet_type`),
  KEY `authapp_wal_user_id_cd4743_idx` (`user_id`,`wallet_type`),
  KEY `authapp_wal_wallet__f94026_idx` (`wallet_account_number`,`updated_at`),
  KEY `authapp_walletaccount_updated_by_id_a7d2c2f2_fk_authapp_user_id` (`updated_by_id`),
  KEY `authapp_walletaccount_wallet_type_04acb8f5` (`wallet_type`),
  KEY `authapp_walletaccount_updated_at_15a7e1ac` (`updated_at`),
  CONSTRAINT `authapp_walletaccount_updated_by_id_a7d2c2f2_fk_authapp_user_id` FOREIGN KEY (`updated_by_id`) REFERENCES `authapp_user` (`id`),
  CONSTRAINT `authapp_walletaccount_user_id_14b6d41f_fk_authapp_user_id` FOREIGN KEY (`user_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_walletaccount` WRITE;
/*!40000 ALTER TABLE `authapp_walletaccount` DISABLE KEYS */;
INSERT INTO `authapp_walletaccount` VALUES
('4cba6d2b-651b-40a7-bd0d-20b2f38e1265','NC','NC12072642829',0.00,'2026-07-12 13:29:42.829301','',NULL,1),
('d1d88a75-8c67-45d4-aaca-5a21ff071756','NC','NC12072643134',0.00,'2026-07-12 13:29:43.136316','',NULL,2),
('7ad94cf6-e2f7-430a-a137-63b4b1e7f21b','C','CA12072642819',0.00,'2026-07-12 13:29:42.821379','',NULL,1),
('563600f3-3780-420e-bb4b-b076a20a4cff','O','OT12072642832',0.00,'2026-07-12 13:29:42.831472','',NULL,1),
('819f5a59-03ad-4556-86b2-b41adb3808eb','O','OT12072643140',0.00,'2026-07-12 13:29:43.139838','',NULL,2),
('6e7a5b8a-a230-4d0b-91fd-b74f6787e852','C','CA12072643129',0.00,'2026-07-12 13:29:43.132898','',NULL,2),
('afddecc1-7596-4578-8eaf-f1170a6137b4','RP','RP12072643143',0.00,'2026-07-12 13:29:43.142094','',NULL,2),
('296052ad-4b73-4e49-82bc-f60774c7a6bf','RP','RP12072642835',0.00,'2026-07-12 13:29:42.833740','',NULL,1);
/*!40000 ALTER TABLE `authapp_walletaccount` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_wallettransaction`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_wallettransaction` (
  `id` uuid NOT NULL,
  `transaction_type` varchar(10) NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `balance_before` decimal(14,2) NOT NULL,
  `balance_after` decimal(14,2) NOT NULL,
  `transaction_reference` varchar(60) NOT NULL,
  `created_at` datetime(6) NOT NULL,
  `note` longtext NOT NULL,
  `validation_status` varchar(10) NOT NULL,
  `performed_by_id` bigint(20) DEFAULT NULL,
  `user_id` bigint(20) NOT NULL,
  `wallet_id` uuid NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `transaction_reference` (`transaction_reference`),
  KEY `authapp_wal_user_id_231c5c_idx` (`user_id`,`created_at`),
  KEY `authapp_wal_transac_efe0f9_idx` (`transaction_type`,`created_at`),
  KEY `authapp_wal_wallet__5b3c25_idx` (`wallet_id`,`created_at`),
  KEY `authapp_wal_transac_f3e71f_idx` (`transaction_reference`),
  KEY `authapp_wallettransa_performed_by_id_59ebc3cc_fk_authapp_u` (`performed_by_id`),
  KEY `authapp_wallettransaction_transaction_type_33854ead` (`transaction_type`),
  KEY `authapp_wallettransaction_created_at_b5f28acf` (`created_at`),
  KEY `authapp_wallettransaction_validation_status_43facd33` (`validation_status`),
  CONSTRAINT `authapp_wallettransa_performed_by_id_59ebc3cc_fk_authapp_u` FOREIGN KEY (`performed_by_id`) REFERENCES `authapp_user` (`id`),
  CONSTRAINT `authapp_wallettransa_wallet_id_53fb8840_fk_authapp_w` FOREIGN KEY (`wallet_id`) REFERENCES `authapp_walletaccount` (`id`),
  CONSTRAINT `authapp_wallettransaction_user_id_5b6d9058_fk_authapp_user_id` FOREIGN KEY (`user_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_wallettransaction` WRITE;
/*!40000 ALTER TABLE `authapp_wallettransaction` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_wallettransaction` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_walletvalidationlog`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_walletvalidationlog` (
  `id` uuid NOT NULL,
  `transaction_type` varchar(10) NOT NULL,
  `entered_amount` decimal(14,2) NOT NULL,
  `expected_amount` decimal(14,2) NOT NULL,
  `is_valid` tinyint(1) NOT NULL,
  `rejection_reason` longtext NOT NULL,
  `validated_at` datetime(6) NOT NULL,
  `transaction_id` uuid DEFAULT NULL,
  `user_id` bigint(20) NOT NULL,
  `validated_by_id` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `transaction_id` (`transaction_id`),
  KEY `authapp_wal_user_id_4a8e8d_idx` (`user_id`,`validated_at`),
  KEY `authapp_wal_is_vali_ec9734_idx` (`is_valid`,`validated_at`),
  KEY `authapp_walletvalida_validated_by_id_b7ae69e9_fk_authapp_u` (`validated_by_id`),
  KEY `authapp_walletvalidationlog_is_valid_86ffda06` (`is_valid`),
  KEY `authapp_walletvalidationlog_validated_at_65dc945f` (`validated_at`),
  CONSTRAINT `authapp_walletvalida_transaction_id_65df240a_fk_authapp_w` FOREIGN KEY (`transaction_id`) REFERENCES `authapp_wallettransaction` (`id`),
  CONSTRAINT `authapp_walletvalida_validated_by_id_b7ae69e9_fk_authapp_u` FOREIGN KEY (`validated_by_id`) REFERENCES `authapp_user` (`id`),
  CONSTRAINT `authapp_walletvalidationlog_user_id_9a528444_fk_authapp_user_id` FOREIGN KEY (`user_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_walletvalidationlog` WRITE;
/*!40000 ALTER TABLE `authapp_walletvalidationlog` DISABLE KEYS */;
/*!40000 ALTER TABLE `authapp_walletvalidationlog` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `authapp_whychooseusfeature`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `authapp_whychooseusfeature` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `icon_name` varchar(40) NOT NULL,
  `color` varchar(20) NOT NULL,
  `title` varchar(100) NOT NULL,
  `description` longtext NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `order` int(10) unsigned NOT NULL CHECK (`order` >= 0),
  `created_at` datetime(6) NOT NULL,
  `updated_at` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `authapp_whychooseusfeature_is_active_d392c7a5` (`is_active`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `authapp_whychooseusfeature` WRITE;
/*!40000 ALTER TABLE `authapp_whychooseusfeature` DISABLE KEYS */;
INSERT INTO `authapp_whychooseusfeature` VALUES
(1,'ShieldCheck','#34d399','Secure & Licensed','All casino partners are fully licensed and regulated. Your safety and privacy are our top priority.',1,0,'2026-07-12 13:28:03.509028','2026-07-12 13:28:03.509040'),
(2,'Zap','#fbbf24','Instant Payments','Deposit and withdraw seamlessly across all types of currencies at casinos.',1,1,'2026-07-12 13:28:03.509540','2026-07-12 13:28:03.509555'),
(3,'Gift','#f472b6','Exclusive Bonuses','Special welcome bonuses, reload offers, and cashback deals available only on Jackpots World.',1,2,'2026-07-12 13:28:03.509930','2026-07-12 13:28:03.509942'),
(4,'Globe','#60a5fa','10+ Country Access','One registration unlocks casino opportunities in Vietnam, Macau, India, Sri Lanka, Philippines and more.',1,3,'2026-07-12 13:28:03.510284','2026-07-12 13:28:03.510296'),
(5,'HeadphonesIcon','#a78bfa','24/7 Live Support','Our multilingual support team is available round the clock via WhatsApp, chat, and call.',1,4,'2026-07-12 13:28:03.510633','2026-07-12 13:28:03.510645'),
(6,'PlaneTakeoff','#22d3ee','Full Trip Packages','We handle flights, hotels, transfers, and casino entry. Hassle-free from home to high-stakes table.',1,5,'2026-07-12 13:28:03.510971','2026-07-12 13:28:03.510983'),
(7,'Crown','#D4AF37','VIP Membership','Earn loyalty points on every booking. Unlock exclusive perks, private rooms, and concierge service.',1,6,'2026-07-12 13:28:03.511304','2026-07-12 13:28:03.511316'),
(8,'BarChart3','#fb923c','Win Rate Analytics','Smart tools to track your sessions, analyse performance, and optimise your gaming strategy.',1,7,'2026-07-12 13:28:03.511629','2026-07-12 13:28:03.511641');
/*!40000 ALTER TABLE `authapp_whychooseusfeature` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `django_admin_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `django_admin_log` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `action_time` datetime(6) NOT NULL,
  `object_id` longtext DEFAULT NULL,
  `object_repr` varchar(200) NOT NULL,
  `action_flag` smallint(5) unsigned NOT NULL CHECK (`action_flag` >= 0),
  `change_message` longtext NOT NULL,
  `content_type_id` int(11) DEFAULT NULL,
  `user_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `django_admin_log_content_type_id_c4bce8eb_fk_django_co` (`content_type_id`),
  KEY `django_admin_log_user_id_c564eba6_fk_authapp_user_id` (`user_id`),
  CONSTRAINT `django_admin_log_content_type_id_c4bce8eb_fk_django_co` FOREIGN KEY (`content_type_id`) REFERENCES `django_content_type` (`id`),
  CONSTRAINT `django_admin_log_user_id_c564eba6_fk_authapp_user_id` FOREIGN KEY (`user_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `django_admin_log` WRITE;
/*!40000 ALTER TABLE `django_admin_log` DISABLE KEYS */;
/*!40000 ALTER TABLE `django_admin_log` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `django_cache`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `django_cache` (
  `cache_key` varchar(255) NOT NULL,
  `value` longtext NOT NULL,
  `expires` datetime(6) NOT NULL,
  PRIMARY KEY (`cache_key`),
  KEY `django_cache_expires` (`expires`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `django_cache` WRITE;
/*!40000 ALTER TABLE `django_cache` DISABLE KEYS */;
/*!40000 ALTER TABLE `django_cache` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `django_content_type`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `django_content_type` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `app_label` varchar(100) NOT NULL,
  `model` varchar(100) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `django_content_type_app_label_model_76bd3d3b_uniq` (`app_label`,`model`)
) ENGINE=InnoDB AUTO_INCREMENT=62 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `django_content_type` WRITE;
/*!40000 ALTER TABLE `django_content_type` DISABLE KEYS */;
INSERT INTO `django_content_type` VALUES
(1,'admin','logentry'),
(3,'auth','group'),
(2,'auth','permission'),
(10,'authapp','activitylog'),
(11,'authapp','adminprofile'),
(12,'authapp','adminwallet'),
(43,'authapp','affiliateclicklog'),
(42,'authapp','affiliateloginlog'),
(35,'authapp','affiliateprofile'),
(13,'authapp','bonusconfig'),
(8,'authapp','casino'),
(30,'authapp','casinoevent'),
(14,'authapp','casinowalletaccount'),
(15,'authapp','casinowallettransaction'),
(47,'authapp','destination'),
(58,'authapp','destinationmedia'),
(31,'authapp','eventticketrequest'),
(48,'authapp','giftitem'),
(49,'authapp','giftstep'),
(50,'authapp','herostat'),
(16,'authapp','kycsubmission'),
(51,'authapp','landingsettings'),
(17,'authapp','notification'),
(18,'authapp','offlinedepositlog'),
(19,'authapp','otprecord'),
(20,'authapp','pendingadmincreation'),
(21,'authapp','pointslog'),
(33,'authapp','pokerregistration'),
(32,'authapp','pokertournament'),
(34,'authapp','promotion'),
(46,'authapp','promotiongalleryimage'),
(36,'authapp','referralcommission'),
(22,'authapp','registration'),
(37,'authapp','responsiblegamblingsettings'),
(23,'authapp','reward'),
(39,'authapp','spinconfig'),
(40,'authapp','spinglobalcounter'),
(41,'authapp','spinhistory'),
(44,'authapp','spinsettings'),
(24,'authapp','superadmintransaction'),
(45,'authapp','supportedlocation'),
(38,'authapp','supportticket'),
(52,'authapp','testimonial'),
(53,'authapp','tourpackage'),
(54,'authapp','trustbadge'),
(60,'authapp','twofactorauth'),
(61,'authapp','twofactorbackupcode'),
(9,'authapp','user'),
(25,'authapp','usergift'),
(26,'authapp','userlevel'),
(55,'authapp','vipserviceimage'),
(56,'authapp','viptier'),
(59,'authapp','viptierbenefit'),
(27,'authapp','walletaccount'),
(28,'authapp','wallettransaction'),
(29,'authapp','walletvalidationlog'),
(57,'authapp','whychooseusfeature'),
(4,'contenttypes','contenttype'),
(5,'sessions','session'),
(6,'token_blacklist','blacklistedtoken'),
(7,'token_blacklist','outstandingtoken');
/*!40000 ALTER TABLE `django_content_type` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `django_migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `django_migrations` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `app` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `applied` datetime(6) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=62 DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `django_migrations` WRITE;
/*!40000 ALTER TABLE `django_migrations` DISABLE KEYS */;
INSERT INTO `django_migrations` VALUES
(1,'contenttypes','0001_initial','2026-07-12 13:27:57.746673'),
(2,'contenttypes','0002_remove_content_type_name','2026-07-12 13:27:57.773128'),
(3,'auth','0001_initial','2026-07-12 13:27:57.873917'),
(4,'auth','0002_alter_permission_name_max_length','2026-07-12 13:27:57.885042'),
(5,'auth','0003_alter_user_email_max_length','2026-07-12 13:27:57.889364'),
(6,'auth','0004_alter_user_username_opts','2026-07-12 13:27:57.895044'),
(7,'auth','0005_alter_user_last_login_null','2026-07-12 13:27:57.898838'),
(8,'auth','0006_require_contenttypes_0002','2026-07-12 13:27:57.899810'),
(9,'auth','0007_alter_validators_add_error_messages','2026-07-12 13:27:57.903615'),
(10,'auth','0008_alter_user_username_max_length','2026-07-12 13:27:57.907899'),
(11,'auth','0009_alter_user_last_name_max_length','2026-07-12 13:27:57.912522'),
(12,'auth','0010_alter_group_name_max_length','2026-07-12 13:27:57.928161'),
(13,'auth','0011_update_proxy_permissions','2026-07-12 13:27:57.933562'),
(14,'auth','0012_alter_user_first_name_max_length','2026-07-12 13:27:57.938006'),
(15,'authapp','0001_initial','2026-07-12 13:28:00.393425'),
(16,'admin','0001_initial','2026-07-12 13:28:00.463940'),
(17,'admin','0002_logentry_remove_auto_add','2026-07-12 13:28:00.486356'),
(18,'admin','0003_logentry_add_action_flag_choices','2026-07-12 13:28:00.508031'),
(19,'authapp','0002_casinoevent_eventticketrequest_pokertournament_and_more','2026-07-12 13:28:01.144428'),
(20,'authapp','0003_alter_casino_name_alter_casino_unique_together','2026-07-12 13:28:01.221606'),
(21,'authapp','0004_seed_casino_country_data','2026-07-12 13:28:01.253333'),
(22,'authapp','0005_seed_events_poker_promotions','2026-07-12 13:28:01.287097'),
(23,'authapp','0006_affiliateprofile_referralcommission','2026-07-12 13:28:01.407233'),
(24,'authapp','0007_casinowalletaccount_country_and_more','2026-07-12 13:28:01.489726'),
(25,'authapp','0008_alter_activitylog_action','2026-07-12 13:28:01.519595'),
(26,'authapp','0009_fix_casino_country_mapping','2026-07-12 13:28:01.570739'),
(27,'authapp','0010_add_casino_wallet_rolling_points','2026-07-12 13:28:01.611321'),
(28,'authapp','0011_add_registration_status','2026-07-12 13:28:02.017959'),
(29,'authapp','0012_add_responsible_gambling_and_support_ticket','2026-07-12 13:28:02.138076'),
(30,'authapp','0013_user_preferred_language','2026-07-12 13:28:02.196307'),
(31,'authapp','0014_add_spin_wheel','2026-07-12 13:28:02.347519'),
(32,'authapp','0015_affiliate_click_and_login_logs','2026-07-12 13:28:02.486732'),
(33,'authapp','0016_user_last_login_city_user_last_login_country_name_and_more','2026-07-12 13:28:02.633736'),
(34,'authapp','0017_spinsettings_and_more','2026-07-12 13:28:02.833958'),
(35,'authapp','0018_supportedlocation','2026-07-12 13:28:02.855233'),
(36,'authapp','0019_seed_supported_locations','2026-07-12 13:28:02.906242'),
(37,'authapp','0020_adminprofile_theme_preference_kycsubmission_kyc_type','2026-07-12 13:28:03.120880'),
(38,'authapp','0021_promotion_terms_conditions_promotion_video_and_more','2026-07-12 13:28:03.239484'),
(39,'authapp','0022_destination_giftitem_giftstep_herostat_and_more','2026-07-12 13:28:03.463989'),
(40,'authapp','0023_seed_landing_content','2026-07-12 13:28:03.552929'),
(41,'authapp','0024_affiliateprofile_can_view_player_transactions_and_more','2026-07-12 13:28:03.671037'),
(42,'authapp','0025_alter_landingsettings_hero_badge_text','2026-07-12 13:28:03.674517'),
(43,'authapp','0026_spinconfig_description_spinconfig_image','2026-07-12 13:28:03.707087'),
(44,'authapp','0027_seed_spin_config','2026-07-12 13:28:03.753970'),
(45,'authapp','0028_notification_authapp_not_user_id_9ba27b_idx_and_more','2026-07-12 13:28:03.830843'),
(46,'authapp','0029_alter_activitylog_action','2026-07-12 13:28:03.856981'),
(47,'authapp','0030_twofactorauth_twofactorbackupcode','2026-07-12 13:28:04.068269'),
(48,'authapp','0031_alter_activitylog_action','2026-07-12 13:28:04.096714'),
(49,'sessions','0001_initial','2026-07-12 13:28:04.113287'),
(50,'token_blacklist','0001_initial','2026-07-12 13:28:04.225176'),
(51,'token_blacklist','0002_outstandingtoken_jti_hex','2026-07-12 13:28:04.260790'),
(52,'token_blacklist','0003_auto_20171017_2007','2026-07-12 13:28:04.300426'),
(53,'token_blacklist','0004_auto_20171017_2013','2026-07-12 13:28:04.352024'),
(54,'token_blacklist','0005_remove_outstandingtoken_jti','2026-07-12 13:28:04.390310'),
(55,'token_blacklist','0006_auto_20171017_2113','2026-07-12 13:28:04.424848'),
(56,'token_blacklist','0007_auto_20171017_2214','2026-07-12 13:28:04.614987'),
(57,'token_blacklist','0008_migrate_to_bigautofield','2026-07-12 13:28:04.778834'),
(58,'token_blacklist','0010_fix_migrate_to_bigautofield','2026-07-12 13:28:04.817921'),
(59,'token_blacklist','0011_linearizes_history','2026-07-12 13:28:04.819483'),
(60,'token_blacklist','0012_alter_outstandingtoken_user','2026-07-12 13:28:04.849999'),
(61,'token_blacklist','0013_alter_blacklistedtoken_options_and_more','2026-07-12 13:28:04.993229');
/*!40000 ALTER TABLE `django_migrations` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `django_session`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `django_session` (
  `session_key` varchar(40) NOT NULL,
  `session_data` longtext NOT NULL,
  `expire_date` datetime(6) NOT NULL,
  PRIMARY KEY (`session_key`),
  KEY `django_session_expire_date_a5c62663` (`expire_date`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `django_session` WRITE;
/*!40000 ALTER TABLE `django_session` DISABLE KEYS */;
/*!40000 ALTER TABLE `django_session` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `token_blacklist_blacklistedtoken`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `token_blacklist_blacklistedtoken` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `blacklisted_at` datetime(6) NOT NULL,
  `token_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `token_id` (`token_id`),
  CONSTRAINT `token_blacklist_blacklistedtoken_token_id_3cc7fe56_fk` FOREIGN KEY (`token_id`) REFERENCES `token_blacklist_outstandingtoken` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `token_blacklist_blacklistedtoken` WRITE;
/*!40000 ALTER TABLE `token_blacklist_blacklistedtoken` DISABLE KEYS */;
/*!40000 ALTER TABLE `token_blacklist_blacklistedtoken` ENABLE KEYS */;
UNLOCK TABLES;

DROP TABLE IF EXISTS `token_blacklist_outstandingtoken`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `token_blacklist_outstandingtoken` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `token` longtext NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `expires_at` datetime(6) NOT NULL,
  `user_id` bigint(20) DEFAULT NULL,
  `jti` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `token_blacklist_outstandingtoken_jti_hex_d9bdf6f7_uniq` (`jti`),
  KEY `token_blacklist_outs_user_id_83bc629a_fk_authapp_u` (`user_id`),
  CONSTRAINT `token_blacklist_outs_user_id_83bc629a_fk_authapp_u` FOREIGN KEY (`user_id`) REFERENCES `authapp_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `token_blacklist_outstandingtoken` WRITE;
/*!40000 ALTER TABLE `token_blacklist_outstandingtoken` DISABLE KEYS */;
/*!40000 ALTER TABLE `token_blacklist_outstandingtoken` ENABLE KEYS */;
UNLOCK TABLES;

/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;
