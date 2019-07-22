import * as React from 'react';
import {
  Form,
  Input,
  Tooltip,
  Icon,
  Cascader,
  Select,
  Row,
  Col,
  Checkbox,
  Button,
  AutoComplete,
} from 'antd';
import { RouterTypes } from 'umi';
import { FormComponentProps } from 'antd/lib/form';

const AutoCompleteOption = AutoComplete.Option;
const { useState } = React;

type FormPageType = RouterTypes & FormComponentProps;

const FormPage: React.SFC<FormPageType> = props => {
  const { getFieldDecorator, validateFieldsAndScroll, getFieldValue, validateFields } = props.form;
  const [autoCompleteResult, setAutoCompleteResult] = useState<string[]>([]);
  const [confirmDirty, setConfirmDirty] = useState<boolean>(false);
  const handleWebsiteChange = value => {
    let autoCompleteResult;
    if (!value) {
      autoCompleteResult = [];
    } else {
      autoCompleteResult = ['.com', '.org', '.net'].map(domain => `${value}${domain}`);
    }
    setAutoCompleteResult(autoCompleteResult);
  };
  const handleSubmit = e => {
    e.preventDefault();
    validateFieldsAndScroll((err, values) => {
      if (!err) {
        console.log('Received values of form: ', values);
      }
    });
  };
  const handleConfirmBlur = e => {
    const value = e.target.value;
    setConfirmDirty(confirmDirty || !!value);
  };
  const compareToFirstPassword = (rule, value, callback) => {
    if (value && value !== getFieldValue('password')) {
      callback('Two passwords that you enter is inconsistent!');
    } else {
      callback();
    }
  };
  const validateToNextPassword = (rule, value, callback) => {
    if (value && confirmDirty) {
      validateFields(['confirm'], { force: true });
    }
    callback();
  };

  const formItemLayout = {
    labelCol: {
      xs: { span: 24 },
      sm: { span: 4 },
    },
    wrapperCol: {
      xs: { span: 24 },
      sm: { span: 20 },
    },
  };
  const tailFormItemLayout = {
    wrapperCol: {
      xs: {
        span: 24,
        offset: 0,
      },
      sm: {
        span: 20,
        offset: 4,
      },
    },
  };
  return (
    <Form {...formItemLayout} onSubmit={handleSubmit}>
      <Form.Item label="E-mail">
        {getFieldDecorator('email', {
          rules: [
            {
              type: 'email',
              message: 'The input is not valid E-mail!',
            },
            {
              required: true,
              message: 'Please input your E-mail!',
            },
          ],
        })(<Input />)}
      </Form.Item>
      <Form.Item label="Password">
        {getFieldDecorator('password', {
          rules: [
            {
              required: true,
              message: 'Please input your password!',
            },
            {
              validator: validateToNextPassword,
            },
          ],
        })(<Input type="password" />)}
      </Form.Item>
      <Form.Item label="Confirm Password">
        {getFieldDecorator('confirm', {
          rules: [
            {
              required: true,
              message: 'Please confirm your password!',
            },
            {
              validator: compareToFirstPassword,
            },
          ],
        })(<Input type="password" onBlur={handleConfirmBlur} />)}
      </Form.Item>
      <Form.Item
        label={
          <span>
            Nickname&nbsp;
            <Tooltip title="What do you want others to call you?">
              <Icon type="question-circle-o" />
            </Tooltip>
          </span>
        }
      >
        {getFieldDecorator('nickname', {
          rules: [{ required: true, message: 'Please input your nickname!', whitespace: true }],
        })(<Input />)}
      </Form.Item>
      <Form.Item label="Website">
        {getFieldDecorator('website', {
          rules: [{ required: true, message: 'Please input website!' }],
        })(
          <AutoComplete
            dataSource={autoCompleteResult.map(website => (
              <AutoCompleteOption key={website}>{website}</AutoCompleteOption>
            ))}
            onChange={handleWebsiteChange}
            placeholder="website"
          >
            <Input />
          </AutoComplete>
        )}
      </Form.Item>
      <Form.Item label="Captcha" extra="We must make sure that your are a human.">
        <Row gutter={8}>
          <Col span={12}>
            {getFieldDecorator('captcha', {
              rules: [{ required: true, message: 'Please input the captcha you got!' }],
            })(<Input />)}
          </Col>
          <Col span={12}>
            <Button>Get captcha</Button>
          </Col>
        </Row>
      </Form.Item>
      <Form.Item {...tailFormItemLayout}>
        {getFieldDecorator('agreement', {
          valuePropName: 'checked',
        })(
          <Checkbox>
            I have read the <a href="">agreement</a>
          </Checkbox>
        )}
      </Form.Item>
      <Form.Item {...tailFormItemLayout}>
        <Button type="primary" htmlType="submit">
          Register
        </Button>
      </Form.Item>
    </Form>
  );
};

export default Form.create({ name: 'register' })(FormPage);
